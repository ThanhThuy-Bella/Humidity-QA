import { NextResponse } from "next/server";
import { ADMIN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { importLegacyReport } from "@/lib/engine/legacy";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  await requireRole(ADMIN);
  const { path, fileName } = (await req.json()) as { path: string; fileName: string };
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from("imports").download(path);
  if (error || !data) throw new Error("Không đọc được file");
  try {
    const n = await importLegacyReport(db, await loadSettings(), Buffer.from(await data.arrayBuffer()), fileName);
    return NextResponse.json({ imported: n });
  } finally {
    await db.storage.from("imports").remove([path]);
  }
});
