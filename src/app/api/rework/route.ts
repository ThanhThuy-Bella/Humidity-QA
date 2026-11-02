import { NextResponse } from "next/server";
import { CAN_INSPECT, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { createRework } from "@/lib/engine/rework";

/** Nút "Nhập kiểm lại sau tái chế": { planId: <PlanID lô gốc FAIL> } → { planId: <lượt kiểm lại> } */
export const POST = handle(async (req: Request) => {
  const user = await requireRole(CAN_INSPECT);
  const { planId } = (await req.json()) as { planId: string };
  if (!planId) throw new Error("Thiếu mã lô");
  const r = await createRework(supabaseAdmin(), await loadSettings(), planId);
  await supabaseAdmin().from("activity_log").insert({ action: "REWORK_CREATE", detail: { parent: planId, ...r }, user_id: user.id });
  return NextResponse.json(r);
});
