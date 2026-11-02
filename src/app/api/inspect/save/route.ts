import { NextResponse } from "next/server";
import { CAN_INSPECT, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { saveInspection, type SaveInput } from "@/lib/engine/inspect";

export const runtime = "nodejs";

export const POST = handle(async (req: Request) => {
  const user = await requireRole(CAN_INSPECT);
  const body = (await req.json()) as SaveInput;
  return NextResponse.json(await saveInspection(supabaseAdmin(), await loadSettings(), body, user.id));
});
