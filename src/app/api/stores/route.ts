import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const PUT = handle(async (req: Request) => {
  await requireRole(CAN_PLAN);
  const { store_name, include } = (await req.json()) as { store_name: string; include: boolean };
  const { error } = await supabaseAdmin().from("stores").update({ include, note: null, updated_at: new Date().toISOString() }).eq("store_name", store_name);
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true });
});
