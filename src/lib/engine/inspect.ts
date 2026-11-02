import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanView, Settings } from "../types";
import { numVal } from "../format";
import { addDays, todayVN } from "../dates";
import { archivePlan } from "./process";

/**
 * Port SaveLotCore (form Nhập):
 *  - Ngày kiểm không sau hôm nay, không trước 14 ngày
 *  - Ghi Vị trí, Pallet, Số thùng, SL áo, 3 số đo ("4,5" = 4.5) cho từng thùng mẫu
 *  - QA / Độ ẩm sau tái chế / Ghi chú-CAPA là cấp lô
 *  - Lô PASS/FAIL và đủ số thùng mẫu → tự đóng, chuyển Lịch sử (+ CAPA nếu FAIL)
 */
export interface SaveRowInput {
  sampleNo: number;
  location?: string | null;
  pallet?: string | null;
  auditCartonNo?: string | null;
  qtyInCarton?: string | null;
  r1?: string | number | null;
  r2?: string | number | null;
  r3?: string | number | null;
}

export interface SaveInput {
  planId: string;
  inspectionDate: string;
  qaName?: string | null;
  reworkHumidity?: string | number | null;
  remark?: string | null;
  rows: SaveRowInput[];
}

export async function saveInspection(db: SupabaseClient, s: Settings, inp: SaveInput, userId: string) {
  const today = todayVN();
  if (!inp.inspectionDate) inp.inspectionDate = today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inp.inspectionDate)) throw new Error("Ngày kiểm ẩm không hợp lệ.");
  if (inp.inspectionDate > today) throw new Error("Ngày kiểm ẩm không được sau hôm nay.");
  if (inp.inspectionDate < addDays(today, -14)) throw new Error("Ngày kiểm ẩm cách hôm nay quá 14 ngày – kiểm tra lại.");
  if (!Array.isArray(inp.rows)) throw new Error("Thiếu dữ liệu thùng mẫu.");

  const { data: plan } = await db.from("inspection_plan").select("plan_id,status").eq("plan_id", inp.planId).maybeSingle();
  if (!plan) throw new Error(`Không tìm thấy lô ${inp.planId} trong kế hoạch.`);
  if (plan.status !== "OPEN") throw new Error(`Lô ${inp.planId} đã đóng (${plan.status}).`);

  // kiểm tra toàn bộ trước khi ghi (tránh ghi dở)
  const parsed = inp.rows.map((r) => {
    const vals = [numVal(r.r1), numVal(r.r2), numVal(r.r3)];
    for (const v of vals) if (v !== null && (v < 0 || v > 100)) throw new Error(`Thùng ${r.sampleNo}: số đo ${v} không hợp lệ.`);
    for (const [raw, v] of [[r.r1, vals[0]], [r.r2, vals[1]], [r.r3, vals[2]]] as const)
      if (raw !== null && raw !== undefined && String(raw).trim() !== "" && v === null)
        throw new Error(`Thùng ${r.sampleNo}: “${raw}” không phải số.`);
    return { r, vals };
  });

  for (const { r, vals } of parsed) {
    const upd: Record<string, unknown> = {
      location: r.location?.trim() || null,
      pallet: r.pallet?.trim() || null,
      audit_carton_no: r.auditCartonNo?.trim() || null,
      qty_in_carton: r.qtyInCarton?.toString().trim() || null,
      r1: vals[0], r2: vals[1], r3: vals[2],
      updated_by: userId, updated_at: new Date().toISOString(),
    };
    if (vals.some((v) => v !== null)) upd.inspection_date = inp.inspectionDate;
    const { error } = await db.from("inspection_readings").update(upd).eq("plan_id", inp.planId).eq("sample_no", r.sampleNo);
    if (error) throw new Error(error.message);
  }

  // chỉ ghi các trường cấp lô được gửi lên (form công nhân không gửi tái chế / ghi chú → giữ nguyên)
  const lotUpd: Record<string, unknown> = { inspection_date: inp.inspectionDate, updated_at: new Date().toISOString() };
  if (inp.qaName !== undefined) lotUpd.qa_name = inp.qaName?.trim() || null;
  if (inp.reworkHumidity !== undefined) lotUpd.rework_humidity = numVal(inp.reworkHumidity);
  if (inp.remark !== undefined) lotUpd.remark = inp.remark?.trim() || null;
  await db.from("inspection_plan").update(lotUpd).eq("plan_id", inp.planId);

  const { data: v } = await db.from("v_plan").select("*").eq("plan_id", inp.planId).single();
  const pv = v as PlanView;
  if ((pv.lot_result === "PASS" || pv.lot_result === "FAIL") && pv.cartons_tested >= pv.sample_cartons) {
    const a = await archivePlan(db, s, inp.planId, userId);
    return { status: "ARCHIVED" as const, result: a.result, capaNo: a.capaNo ?? null, tested: pv.cartons_tested, need: pv.sample_cartons };
  }
  return { status: pv.lot_result, result: pv.lot_result, capaNo: null, tested: pv.cartons_tested, need: pv.sample_cartons };
}
