import type { PlanView } from "./types";
import { fmtDate } from "./dates";

/** Danh sách chọn lô: lô trễ lên đầu, rồi theo ngày kiểm (RefreshNhapList) */
export function lotOptions(plans: PlanView[]) {
  return plans
    .filter((p) => ["PENDING", "IN PROGRESS", "FAIL"].includes(p.lot_result))
    .sort((a, b) => (a.priority === "LATE" ? 0 : 1) - (b.priority === "LATE" ? 0 : 1) || a.sched_date.localeCompare(b.sched_date))
    .map((p) => ({ id: p.plan_id, late: p.priority === "LATE", label: `${p.plan_id}   ${p.jo}   ${p.buyer_po}   ${fmtDate(p.sched_date, "dm")}` }));
}

export const toNum = (x: unknown) => (x === null || x === undefined ? null : Number(x));
