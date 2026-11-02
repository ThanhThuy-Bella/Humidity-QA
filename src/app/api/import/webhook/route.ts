import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { runImport } from "@/lib/engine/process";
import { sendAfterImport } from "@/lib/email/dailyPlan";
import { dateFromName, todayVN } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Thay cho đọc Outlook: Power Automate "When a new email arrives" (tiêu đề chứa 'Daily Stock Report THV-WH')
 * → HTTP POST file đính kèm tới đây. Header: x-webhook-secret: <IMPORT_WEBHOOK_SECRET>
 * Body: a) JSON { fileName, subject, contentBase64 } ; b) JSON { fileName, storagePath } ; c) nhị phân .xlsx + header x-file-name
 */
export const POST = handle(async (req: Request) => {
  if (!process.env.IMPORT_WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== process.env.IMPORT_WEBHOOK_SECRET)
    throw new HttpError(401, "Sai webhook secret");
  const db = supabaseAdmin();
  let buf: Buffer;
  let fileName = req.headers.get("x-file-name") ?? "";
  let subject = "";
  let storagePath: string | null = null;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const b = (await req.json()) as { fileName?: string; subject?: string; contentBase64?: string; storagePath?: string };
    fileName = b.fileName ?? fileName;
    subject = b.subject ?? "";
    if (b.storagePath) {
      storagePath = b.storagePath;
      const { data, error } = await db.storage.from("imports").download(b.storagePath);
      if (error || !data) throw new Error("Không đọc được storagePath");
      buf = Buffer.from(await data.arrayBuffer());
    } else if (b.contentBase64) {
      buf = Buffer.from(b.contentBase64, "base64");
    } else throw new HttpError(400, "Thiếu contentBase64 hoặc storagePath");
  } else {
    buf = Buffer.from(await req.arrayBuffer());
  }
  if (!buf.length) throw new HttpError(400, "File rỗng");
  if (!fileName || !dateFromName(fileName)) fileName = `bao-cao_${dateFromName(subject) ?? todayVN()}.xlsx`;
  try {
    const result = await runImport(db, await loadSettings(), buf, fileName, "webhook", null, false);
    const email = await sendAfterImport();
    return NextResponse.json({ ...result, email });
  } finally {
    if (storagePath) await db.storage.from("imports").remove([storagePath]);
  }
});
