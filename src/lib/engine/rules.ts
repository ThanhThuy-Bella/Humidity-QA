/**
 * BUSINESS RULES – port 1:1 từ VBA (BuildStockLots + công thức cột O:W của tblLots + công thức tblPlan).
 * Các hàm ở đây THUẦN (không đụng DB) để test được.
 */
import type { EvaluatedLot, Settings, StockLot, WarehouseCarton, Trigger } from "../types";
import { addDays, diffDays, maxDate, monthOf } from "../dates";
import { joinKeys, lotKey, roundUp } from "../format";

// R1. Lọc + gom lô
//   - Chỉ store Include = Y, chỉ Grade = GradeFilter (trống = mọi grade)
//   - Brand Code từ Brand Map; chưa có → tiền tố Style no trước '-' và tự thêm vào Brand Map
//   - Lô = Brand Code + JO + Buyer PO ; Cartons = số UCC ; Qty = tổng ; BPO date & Stock-in = ngày SỚM nhất
export interface BuildLotsInput {
  cartons: WarehouseCarton[];
  includedStores: Set<string>;
  brandMap: Map<string, string>;
  gradeFilter: string;
}

export interface BuildLotsOutput {
  lots: StockLot[];
  newBrands: Map<string, string>;
  includedCartons: number;
  storeCounts: Map<string, number>;
}

export function buildStockLots({ cartons, includedStores, brandMap, gradeFilter }: BuildLotsInput): BuildLotsOutput {
  const grade = gradeFilter.trim().toUpperCase();
  const inc = new Set(Array.from(includedStores).map((s) => s.trim().toUpperCase()));
  const bmap = new Map(Array.from(brandMap).map(([k, v]) => [k.trim().toUpperCase(), v]));
  const newBrands = new Map<string, string>();
  const storeCounts = new Map<string, number>();

  type Acc = StockLot & { _col: Set<string>; _loc: Set<string>; _pal: Set<string>; _sto: Set<string>; _lp: Map<string, Set<string>> };
  const idx = new Map<string, Acc>();
  let included = 0;

  for (const w of cartons) {
    const store = w.storeName.trim();
    storeCounts.set(store, (storeCounts.get(store) ?? 0) + 1);
    if (!inc.has(store.toUpperCase()) || !w.refNo) continue;
    if (grade && w.grade.trim().toUpperCase() !== grade) continue;
    included++;

    const bn = w.brandName.trim();
    let bc = bmap.get(bn.toUpperCase());
    if (!bc) {
      bc = (w.styleNo.split("-")[0] ?? "").trim();
      if (bn) {
        bmap.set(bn.toUpperCase(), bc);
        newBrands.set(bn, bc);
      }
    }
    const k = `${bc.toUpperCase()}|${lotKey(w.refNo, w.buyerPo)}`;
    let a = idx.get(k);
    if (!a) {
      a = {
        brand_code: bc, customer: w.customer, brand_name: w.brandName, jo: w.refNo, buyer_po: w.buyerPo,
        style: w.styleNo, colors: "", locations: "", pallets: "", location_pallets: {}, cartons: 0, qty: 0,
        bpo_date: null, stock_in_date: null, stores: "",
        _col: new Set(), _loc: new Set(), _pal: new Set(), _sto: new Set(), _lp: new Map(),
      };
      idx.set(k, a);
    }
    a.cartons += 1;
    a.qty += w.qty;
    if (w.color) a._col.add(w.color);
    if (w.location) a._loc.add(w.location);
    if (w.pallet) a._pal.add(w.pallet);
    a._sto.add(store);
    const loc = w.location || "(trống)";
    if (!a._lp.has(loc)) a._lp.set(loc, new Set());
    if (w.pallet) a._lp.get(loc)!.add(w.pallet);
    if (w.buyerPoDate && (!a.bpo_date || w.buyerPoDate < a.bpo_date)) a.bpo_date = w.buyerPoDate;
    if (w.inWarehouseDate && (!a.stock_in_date || w.inWarehouseDate < a.stock_in_date)) a.stock_in_date = w.inWarehouseDate;
  }

  const lots: StockLot[] = Array.from(idx.values()).map(({ _col, _loc, _pal, _sto, _lp, ...l }) => {
    const lp: Record<string, string[]> = {};
    Array.from(_lp.keys()).sort().forEach((k) => (lp[k] = Array.from(_lp.get(k)!).sort()));
    return { ...l, colors: joinKeys(_col), locations: joinKeys(_loc), pallets: joinKeys(_pal), stores: joinKeys(_sto), location_pallets: lp };
  });
  return { lots, newBrands, includedCartons: included, storeCounts };
}

// R2. Đánh giá lô theo PlanDate – cột O:W tblLots
//   R SchedInspDate = MAX(PlanDate, BPO − 7) ; S IsoMinDays theo tháng của R (mưa 4 tuần / khô 6 tuần) × 7
//   U BPOStatus = NO BPO | OVERDUE | DUE (≤ 14 ngày) | LATER
//   V Trigger (khi DUE và tồn tại ngày kiểm ≥ ISO): chưa kiểm → PRE-SHIPMENT ; BPO − LastInsp > 7 → RE-INSPECT
//   W Priority: PlanDate > BPO − 5 → LATE, ngược lại ON TIME
export function isoMinDays(s: Settings, schedIso: string): number {
  const m = monthOf(schedIso);
  return (m >= s.rain_start && m <= s.rain_end ? s.iso_weeks_rain : s.iso_weeks_dry) * 7;
}

export function evaluateLot(lot: StockLot, lastInsp: string | null, s: Settings, planDate: string): EvaluatedLot {
  const bpo = lot.bpo_date;
  const stockIn = lot.stock_in_date;
  const daysInWh = stockIn ? diffDays(planDate, stockIn) : null;
  const daysToBpo = bpo ? diffDays(bpo, planDate) : null;
  const sched = bpo ? maxDate(planDate, addDays(bpo, -s.preship_earliest)) : null;
  const isoMin = sched ? isoMinDays(s, sched) : null;
  const atInsp = sched ? (stockIn ? diffDays(sched, stockIn) : Number.MAX_SAFE_INTEGER) : null;

  const bpoStatus: EvaluatedLot["bpo_status"] =
    !bpo ? "NO BPO" : daysToBpo! < 0 ? "OVERDUE" : daysToBpo! <= s.plan_lookahead ? "DUE" : "LATER";

  let trigger: Trigger = "";
  if (bpoStatus === "DUE" && atInsp !== null && isoMin !== null && atInsp >= isoMin) {
    if (!lastInsp) trigger = "PRE-SHIPMENT";
    else if (diffDays(bpo!, lastInsp) > s.preship_earliest) trigger = "RE-INSPECT (new BPO)";
  }
  const priority: EvaluatedLot["priority"] = trigger ? (planDate > addDays(bpo!, -s.preship_deadline) ? "LATE" : "ON TIME") : "";

  return {
    ...lot, days_in_wh: daysInWh, days_to_bpo: daysToBpo, last_insp_date: lastInsp, sched_insp_date: sched,
    iso_min_days: isoMin, days_in_wh_at_insp: atInsp === Number.MAX_SAFE_INTEGER ? null : atInsp,
    bpo_status: bpoStatus, trigger, priority,
  };
}

export function evaluateLots(lots: StockLot[], lastInsp: Map<string, string>, s: Settings, planDate: string) {
  return lots.map((l) => evaluateLot(l, lastInsp.get(lotKey(l.jo, l.buyer_po)) ?? null, s, planDate));
}

// R3. Cỡ mẫu: ROUNDUP(Cartons × SampleRate, 0), tối thiểu 1
export function sampleCartons(cartons: number, s: Settings): number {
  return Math.max(1, roundUp(cartons * s.sample_rate));
}

// R4. Thùng: Max ≤ HumLimit → PASS. Lô: ≥1 thùng FAIL → FAIL; đủ mẫu đo đủ → PASS; có số đo → IN PROGRESS
export function cartonResult(max: number | null, s: Settings): "" | "PASS" | "FAIL" {
  if (max === null || max === undefined) return "";
  return Number(max) <= s.hum_limit ? "PASS" : "FAIL";
}

/** Mã kế hoạch HI-yymmdd-### */
export function planIdPrefix(planDate: string) {
  return `HI-${planDate.slice(2, 4)}${planDate.slice(5, 7)}${planDate.slice(8, 10)}-`;
}
