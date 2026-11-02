import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { runImport } from "@/lib/engine/process";
import { sendAfterImport } from "@/lib/email/dailyPlan";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Nút "Cập nhật báo cáo kho" = RunDailyProcess */
export const POST = handle(async (req: Request) => {
  const user = await requireRole(CAN_PLAN);
  const { path, fileName, force } = (await req.json()) as { path: string; fileName: string; force?: boolean };
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from("imports").download(path);
  if (error || !data) throw new Error("Không đọc được file đã upload: " + (error?.message ?? ""));
  const buf = Buffer.from(await data.arrayBuffer());
  try {
    const result = await runImport(db, await loadSettings(), buf, fileName, "upload", user.id, !!force);
    const email = await sendAfterImport();
    return NextResponse.json({ ...result, email });
  } finally {
    await db.storage.from("imports").remove([path]); // giống VBA: file tạm đọc xong là xóa
  }
});
