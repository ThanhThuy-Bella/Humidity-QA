import "server-only";
import { fetchAll, supabaseAdmin } from "./supabase/admin";
import type { Capa, EvaluatedLot, HistoryRow, PlanView, Settings } from "./types";
import { loadLastInspMap, loadStockLots } from "./engine/process";
import { evaluateLots } from "./engine/rules";
import { planDateOf } from "./settings";
import { todayVN } from "./dates";

// Các hàm này chạy phía server sau requireUser(); đọc bằng service role.

export async function openPlans(): Promise<PlanView[]> {
  const db = supabaseAdmin();
  const rows = await fetchAll<PlanView>((a, b) =>
    db.from("v_plan").select("*").eq("status", "OPEN").order("sched_date").order("brand_code").order("plan_id").range(a, b),
  );
  return rows.map(normPlan);
}

export function normPlan(p: PlanView): PlanView {
  return {
    ...p,
    qty: Number(p.qty),
    max_humidity: p.max_humidity === null ? null : Number(p.max_humidity),
    rework_humidity: p.rework_humidity === null ? null : Number(p.rework_humidity),
    aging_weeks: p.aging_weeks === null ? null : Number(p.aging_weeks),
  };
}

/** Lô cần kiểm đến ngày d (gồm lô trễ): PENDING / IN PROGRESS (+FAIL chưa đủ mẫu) – LATE lên đầu */
export function dueLots(plans: PlanView[], d: string, includeFail = true): PlanView[] {
  const ok = new Set(["PENDING", "IN PROGRESS", ...(includeFail ? ["FAIL"] : [])]);
  return plans
    .filter((p) => p.sched_date <= d && ok.has(p.lot_result))
    .sort((a, b) => {
      const la = a.priority === "LATE" ? 0 : 1;
      const lb = b.priority === "LATE" ? 0 : 1;
      return la - lb || a.sched_date.localeCompare(b.sched_date) || a.brand_code.localeCompare(b.brand_code);
    });
}

export async function evaluatedStock(s: Settings): Promise<EvaluatedLot[]> {
  const db = supabaseAdmin();
  const [lots, last] = await Promise.all([loadStockLots(db), loadLastInspMap(db)]);
  return evaluateLots(lots, last, s, planDateOf(s));
}

export interface HistoryFilter { from?: string; to?: string; brand?: string; result?: string; q?: string }

export async function historyRows(f: HistoryFilter = {}): Promise<HistoryRow[]> {
  const db = supabaseAdmin();
  const kw = (f.q ?? "").replace(/[,()%*\\:"']/g, "").trim();
  const rows = await fetchAll<HistoryRow>((a, b) => {
    let q = db.from("inspection_history").select("*");
    if (f.from) q = q.gte("inspection_date", f.from);
    if (f.to) q = q.lte("inspection_date", f.to);
    if (f.brand) q = q.eq("brand_code", f.brand);
    if (f.result) q = q.eq("result", f.result);
    if (kw) q = q.or(`jo.ilike.%${kw}%,bpo.ilike.%${kw}%,plan_id.ilike.%${kw}%`);
    return q.order("inspection_date", { ascending: false }).order("plan_id").range(a, b);
  });
  return rows.map((r) => ({
    ...r,
    max_humidity: r.max_humidity === null ? null : Number(r.max_humidity),
    avg_humidity: r.avg_humidity === null ? null : Number(r.avg_humidity),
    rework_humidity: r.rework_humidity === null ? null : Number(r.rework_humidity),
  }));
}

export async function capaRows(status?: string): Promise<Capa[]> {
  const db = supabaseAdmin();
  let q = db.from("capa").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as Capa[];
}

export interface BrandStat {
  brand: string; lotsInStock: number; cartons: number; dueNow: number; inspected: number;
  pass: number; fail: number; under: number; avgHum: number;
}

/** Bảng theo Brand (Dashboard D5:K18): top 14 brand theo số thùng tồn */
export function brandStats(stock: EvaluatedLot[], hist: HistoryRow[], top = 14): BrandStat[] {
  const m = new Map<string, BrandStat>();
  const get = (b: string) => {
    if (!m.has(b)) m.set(b, { brand: b, lotsInStock: 0, cartons: 0, dueNow: 0, inspected: 0, pass: 0, fail: 0, under: 0, avgHum: 0 });
    return m.get(b)!;
  };
  for (const l of stock) {
    const s = get(l.brand_code);
    s.lotsInStock++;
    s.cartons += l.cartons;
    if (l.trigger) s.dueNow++;
  }
  const sums = new Map<string, { s: number; n: number }>();
  for (const h of hist) {
    if (!h.brand_code) continue;
    const s = get(h.brand_code);
    if (h.result !== "NO DATA") s.inspected++;
    if (h.result === "PASS") s.pass++;
    if (h.result === "FAIL") s.fail++;
    if (h.sampling_check === "UNDER") s.under++;
    if (h.avg_humidity !== null) {
      const x = sums.get(h.brand_code) ?? { s: 0, n: 0 };
      x.s += Number(h.avg_humidity);
      x.n++;
      sums.set(h.brand_code, x);
    }
  }
  for (const [b, x] of sums) get(b).avgHum = x.n ? x.s / x.n : 0;
  return Array.from(m.values()).sort((a, b) => b.cartons - a.cartons || b.inspected - a.inspected).slice(0, top);
}

export function today() {
  return todayVN();
}
