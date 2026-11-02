import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { runPlanning } from "@/lib/engine/process";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = handle(async () => {
  const user = await requireRole(CAN_PLAN);
  return NextResponse.json(await runPlanning(supabaseAdmin(), await loadSettings(), user.id));
});
