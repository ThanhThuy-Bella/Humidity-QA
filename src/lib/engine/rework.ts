import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadingRow, Settings } from "../types";

import { todayVN } from "../dates";

/**
 * Tạo lượt KIỂM LẠI SAU TÁI CHẾ cho lô gốc bị FAIL.
 *  - Đo lại TOÀN BỘ thùng mẫu của lô gốc (quy định THV, chị Ana xác nhận 21/10/2026) – mọi lần kiểm lại
 *  - Điền sẵn vị trí / pallet / số thùng / SL áo theo lô gốc; số đo để trống
 *  - Mã: <PlanID gốc>-R1, -R2, …   Ngày kiểm = hôm nay
 * Đã có lượt kiểm lại đang mở → trả về lượt đó.
 */
export async function createRework(db: SupabaseClient, _s: Settings, parentId: string) {
  const { data: open } = await db.from("inspection_plan").select("plan_id").eq("parent_plan_id", parentId).eq("kind", "REWORK").eq("status", "OPEN").maybeSingle();
  if (open) return { planId: open.plan_id as string, existed: true };

  const { data: parent } = await db.from("inspection_plan").select("*").eq("plan_id", parentId).maybeSingle();
  if (!parent) throw new Error("Chỉ kiểm lại được lô kiểm trên hệ thống mới (lô LEGACY không kiểm lại được trên app).");
  if (parent.kind === "REWORK") throw new Error("Hãy mở kiểm lại từ lô gốc.");
  if (parent.status !== "ARCHIVED" || parent.final_result !== "FAIL") throw new Error("Lô này không ở trạng thái FAIL đã đóng.");

  const { data: prev } = await db.from("inspection_plan").select("plan_id,final_result")
    .eq("parent_plan_id", parentId).eq("kind", "REWORK").eq("status", "ARCHIVED").order("created_at", { ascending: false });
  if (prev?.[0]?.final_result === "PASS") throw new Error("Lô đã kiểm lại ĐẠT. ");
  const { data: rd } = await db.from("inspection_readings").select("*").eq("plan_id", parentId).order("sample_no");
  const base = (rd ?? []) as ReadingRow[];
  if (!base.length) throw new Error("Không tìm thấy thùng mẫu của lô gốc.");

  const planId = `${parentId}-R${(prev?.length ?? 0) + 1}`;
  const { error } = await db.from("inspection_plan").insert({
    plan_id: planId, kind: "REWORK", parent_plan_id: parentId,
    brand_code: parent.brand_code, customer: parent.customer, jo: parent.jo, buyer_po: parent.buyer_po, style: parent.style, color: parent.color,
    locations: parent.locations, pallets: parent.pallets, location_pallets: parent.location_pallets, cartons: parent.cartons, qty: parent.qty,
    bpo_date: parent.bpo_date, stock_in_date: parent.stock_in_date, sched_date: todayVN(), trigger: "REWORK",
    sample_cartons: base.length, sample_colors: parent.sample_colors ?? {}, status: "OPEN",
  });
  if (error) throw new Error(error.message);
  const { error: e2 } = await db.from("inspection_readings").insert(base.map((r, i) => ({
    plan_id: planId, sample_no: i + 1, color: r.color ?? null, location: r.location, pallet: r.pallet, audit_carton_no: r.audit_carton_no, qty_in_carton: r.qty_in_carton,
  })));
  if (e2) throw new Error(e2.message);
  return { planId, existed: false, cartons: base.length };
}
