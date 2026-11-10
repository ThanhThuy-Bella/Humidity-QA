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

  type Acc = StockLot & { _cc: Map<string, number>; _col: Set<string>; _loc: Set<string>; _pal: Set<string>; _sto: Set<string>; _lp: Map<string, Set<string>> };
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
        _cc: new Map(), _col: new Set(), _loc: new Set(), _pal: new Set(), _sto: new Set(), _lp: new Map(),
      };
      idx.set(k, a);
    }
    a.cartons += 1;
    a.qty += w.qty;
    if (w.color) a._col.add(w.color);
    const ck = w.color || "(không màu)";
    a._cc.set(ck, (a._cc.get(ck) ?? 0) + 1);
    if (w.location) a._loc.add(w.location);
    if (w.pallet) a._pal.add(w.pallet);
    a._sto.add(store);
    const loc = w.location || "(trống)";
    if (!a._lp.has(loc)) a._lp.set(loc, new Set());
    if (w.pallet) a._lp.get(loc)!.add(w.pallet);
    if (w.buyerPoDate && (!a.bpo_date || w.buyerPoDate < a.bpo_date)) a.bpo_date = w.buyerPoDate;
    if (w.inWarehouseDate && (!a.stock_in_date || w.inWarehouseDate < a.stock_in_date)) a.stock_in_date = w.inWarehouseDate;
  }

  const lots: StockLot[] = Array.from(idx.values()).map(({ _cc, _col, _loc, _pal, _sto, _lp, ...l }) => {
    const lp: Record<string, string[]> = {};
    Array.from(_lp.keys()).sort().forEach((k) => (lp[k] = Array.from(_lp.get(k)!).sort()));
    return { ...l, colors: joinKeys(_col), locations: joinKeys(_loc), pallets: joinKeys(_pal), stores: joinKeys(_sto), location_pallets: lp, color_cartons: Object.fromEntries(_cc) };
  });
  return { lots, newBrands, includedCartons: included, storeCounts };
}

// R2. Đánh giá lô theo PlanDate (v1.9 – gom đợt kiểm theo tuần)
//   Hạn kiểm = BPO − preship_earliest (10). Ngày kiểm = ngày đợt (Thứ 2) gần nhất KHÔNG SAU hạn kiểm (kiểm sớm được).
//   Đợt đó đã qua → đợt kế tiếp nếu còn ≤ BPO − preship_deadline (5) ; không kịp → ngày làm việc kế tiếp (PLAN BỔ SUNG).
//   ISO tồn tối thiểu tính đến NGÀY KIỂM (mưa 4 tuần / khô 6 tuần).
//   BPOStatus DUE khi BPO ≤ max(plan_lookahead, preship_earliest + 7) ngày tới (đủ cho đợt tuần sau).
//   Trigger: chưa kiểm → PRE-SHIPMENT ; BPO − LastInsp > preship_earliest → RE-INSPECT ; Priority LATE nếu ngày kiểm > BPO − 5.
export function isoMinDays(s: Settings, schedIso: string): number {
  const m = monthOf(schedIso);
  return (m >= s.rain_start && m <= s.rain_end ? s.iso_weeks_rain : s.iso_weeks_dry) * 7;
}

const wd = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
/** Ngày làm việc (bỏ Chủ nhật) */
export function nextWorkDay(iso: string): string {
  let d = addDays(iso, 1);
  while (wd(d) === 0) d = addDays(d, 1);
  return d;
}
/** Ngày đợt kiểm gần nhất ≤ iso */
export function waveOnOrBefore(iso: string, weekday: number): string {
  return addDays(iso, -((wd(iso) - weekday + 7) % 7));
}
/** Ngày đợt kiểm gần nhất ≥ iso */
export function waveOnOrAfter(iso: string, weekday: number): string {
  return addDays(iso, (weekday - wd(iso) + 7) % 7);
}

export function schedFor(bpo: string, planDate: string, s: Settings): { sched: string; urgent: boolean } {
  const target = addDays(bpo, -s.preship_earliest);
  const deadline = addDays(bpo, -s.preship_deadline);
  const w = waveOnOrBefore(target, s.insp_wave_weekday ?? 1);
  if (w >= planDate) return { sched: w, urgent: false };
  const next = waveOnOrAfter(planDate, s.insp_wave_weekday ?? 1);
  if (next <= deadline) return { sched: next, urgent: false };
  // không kịp đợt nào → kiểm ngày làm việc kế tiếp (hôm nay nếu hôm nay là ngày làm việc và chưa qua hạn)
  return { sched: wd(planDate) === 0 ? nextWorkDay(planDate) : planDate, urgent: true };
}

export function evaluateLot(lot: StockLot, lastInsp: string | null, s: Settings, planDate: string): EvaluatedLot {
  const bpo = lot.bpo_date;
  const stockIn = lot.stock_in_date;
  const daysInWh = stockIn ? diffDays(planDate, stockIn) : null;
  const daysToBpo = bpo ? diffDays(bpo, planDate) : null;
  const sched = bpo ? schedFor(bpo, planDate, s).sched : null;
  const isoMin = sched ? isoMinDays(s, sched) : null;
  const atInsp = sched ? (stockIn ? diffDays(sched, stockIn) : Number.MAX_SAFE_INTEGER) : null;
  const lookahead = Math.max(s.plan_lookahead, s.preship_earliest + 7);

  const bpoStatus: EvaluatedLot["bpo_status"] =
    !bpo ? "NO BPO" : daysToBpo! < 0 ? "OVERDUE" : daysToBpo! <= lookahead ? "DUE" : "LATER";

  let trigger: Trigger = "";
  if (bpoStatus === "DUE" && atInsp !== null && isoMin !== null && atInsp >= isoMin) {
    if (!lastInsp) trigger = "PRE-SHIPMENT";
    else if (diffDays(bpo!, lastInsp) > s.preship_earliest) trigger = "RE-INSPECT (new BPO)";
  }
  const deadline = bpo ? addDays(bpo, -s.preship_deadline) : "";
  const priority: EvaluatedLot["priority"] = trigger ? (planDate > deadline || sched! > deadline ? "LATE" : "ON TIME") : "";

  return {
    ...lot, days_in_wh: daysInWh, days_to_bpo: daysToBpo, last_insp_date: lastInsp, sched_insp_date: sched,
    iso_min_days: isoMin, days_in_wh_at_insp: atInsp === Number.MAX_SAFE_INTEGER ? null : atInsp,
    bpo_status: bpoStatus, trigger, priority,
  };
}

export function evaluateLots(lots: StockLot[], lastInsp: Map<string, string>, s: Settings, planDate: string) {
  return lots.map((l) => evaluateLot(l, lastInsp.get(lotKey(l.jo, l.buyer_po)) ?? null, s, planDate));
}

// R3. Cỡ mẫu (v1.9): max(ROUNDUP(Cartons × SampleRate), số màu), tối thiểu 1 – mỗi màu ít nhất 1 thùng
export function sampleCartons(cartons: number, s: Settings, colorCount = 1): number {
  return Math.min(Math.max(cartons, 1), Math.max(1, roundUp(cartons * s.sample_rate), colorCount));
}

/** Chia n thùng mẫu cho các màu: mỗi màu 1 thùng, phần dư theo tỷ lệ số thùng (dư lớn nhất), không vượt số thùng màu đó */
export function allocateColors(n: number, colorCartons: Record<string, number> | undefined | null): Record<string, number> {
  const entries = Object.entries(colorCartons ?? {}).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) return {};
  const out: Record<string, number> = {};
  if (n <= entries.length) { entries.slice(0, n).forEach(([k]) => (out[k] = 1)); return out; }
  entries.forEach(([k]) => (out[k] = 1));
  let left = n - entries.length;
  const total = entries.reduce((a, [, c]) => a + c, 0);
  const want = entries.map(([k, c]) => ({ k, cap: c - 1, exact: (left * c) / total }));
  want.forEach((w) => { const add = Math.min(w.cap, Math.floor(w.exact)); out[w.k] += add; left -= add; });
  const rest = want.map((w) => ({ ...w, frac: w.exact - Math.floor(w.exact) })).sort((a, b) => b.frac - a.frac);
  for (let guard = 0; left > 0 && guard < 1000; guard++) {
    const w = rest[guard % rest.length];
    if (out[w.k] - 1 < w.cap) { out[w.k]++; left--; }
  }
  return out;
}

/** Danh sách màu theo thứ tự thùng mẫu 1..n */
export function colorSequence(alloc: Record<string, number>): string[] {
  const seq: string[] = [];
  Object.entries(alloc).forEach(([k, c]) => { for (let i = 0; i < c; i++) seq.push(k); });
  return seq;
}

/** Cân tải: tối đa max thùng mẫu / ngày, dư dời sang ngày làm việc kế tiếp (lô to hơn max vẫn được xếp 1 ngày riêng) */
export function placeWithCapacity(sched: string, cartons: number, load: Map<string, number>, max: number): string {
  if (!max) return sched;
  let d = sched;
  for (let i = 0; i < 60; i++) {
    const used = load.get(d) ?? 0;
    if (used === 0 || used + cartons <= max) return d;
    d = nextWorkDay(d);
  }
  return d;
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
