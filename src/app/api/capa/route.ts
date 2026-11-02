import { NextResponse } from "next/server";
import { CAN_INSPECT, displayName, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nextCapaNo } from "@/lib/engine/process";
import { loadSettings } from "@/lib/settings";

/** Tạo CAPA thủ công từ 1 dòng Lịch sử (lô PASS sát ngưỡng, khiếu nại khách, lô LEGACY…) */
export const POST = handle(async (req: Request) => {
  const user = await requireRole(CAN_INSPECT);
  const { planId, problem } = (await req.json()) as { planId: string; problem?: string };
  const db = supabaseAdmin();
  const { data: dup } = await db.from("capa").select("id,capa_no").eq("history_plan_id", planId).maybeSingle();
  if (dup) return NextResponse.json({ id: dup.id, capa_no: dup.capa_no, existed: true });
  const { data: h } = await db.from("inspection_history").select("*").eq("plan_id", planId).maybeSingle();
  if (!h) throw new Error("Không tìm thấy lô trong Lịch sử");
  const { data: plan } = await db.from("inspection_plan").select("plan_id").eq("plan_id", planId).maybeSingle();
  const s = await loadSettings();
  const capa_no = await nextCapaNo(db);
  const { data, error } = await db.from("capa").insert({
    capa_no, plan_id: plan ? planId : null, history_plan_id: planId, brand_code: h.brand_code, jo: h.jo, buyer_po: h.bpo, color: h.color,
    inspection_date: h.inspection_date, max_humidity: h.max_humidity, hum_limit: s.hum_limit, rework_humidity: h.rework_humidity,
    problem: problem || `Lô ${h.jo} / ${h.bpo} – ${h.result}, max ${h.max_humidity ?? ""}%`,
    status: "OPEN", source: "MANUAL", created_by: user.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await db.from("capa_logs").insert({ capa_id: data.id, action: "CREATED", note: "Tạo thủ công", user_id: user.id, user_name: displayName(user) });
  return NextResponse.json({ id: data.id, capa_no });
});
