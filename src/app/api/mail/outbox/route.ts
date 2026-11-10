import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v1.11 – Hàng chờ email cho macro Outlook (server công ty chặn SMTP → Outlook trên máy chị gửi thay).
 * Header: x-webhook-secret: <IMPORT_WEBHOOK_SECRET>
 * GET  → mail QUEUED cũ nhất, dạng text UTF-8 (dễ đọc bằng VBA), rỗng = không có mail:
 *        dòng 1 id | 2 To (;) | 3 CC (;) | 4 tiêu đề | 5 tên file đính kèm | 6 file base64 | 7+ nội dung HTML
 * POST { id, ok, error } → đánh dấu SENT / lỗi (sau 3 lần lỗi → ERROR, không gửi nữa)
 */
function auth(req: Request) {
  if (!process.env.IMPORT_WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== process.env.IMPORT_WEBHOOK_SECRET)
    throw new HttpError(401, "Sai webhook secret");
}
const one = (s: string | null | undefined) => (s ?? "").replace(/[\r\n]+/g, " ").trim();

export const GET = handle(async (req: Request) => {
  auth(req);
  const since = new Date(Date.now() - 3 * 864e5).toISOString(); // mail quá 3 ngày chưa gửi → bỏ
  const { data, error } = await supabaseAdmin().from("mail_outbox").select("*")
    .eq("status", "QUEUED").gte("created_at", since).order("created_at").limit(1);
  if (error) throw new Error(error.message);
  const m = data?.[0];
  const body = m
    ? [String(m.id), one((m.recipients ?? []).join(";")), one((m.cc ?? []).join(";")), one(m.subject), one(m.file_name),
       (m.attachment_b64 ?? "").replace(/\s+/g, ""), m.html ?? ""].join("\n")
    : "";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
});

export const POST = handle(async (req: Request) => {
  auth(req);
  const b = (await req.json().catch(() => ({}))) as { id?: number | string; ok?: boolean; error?: string };
  const id = Number(b.id);
  if (!id) throw new HttpError(400, "Thiếu id");
  const db = supabaseAdmin();
  const { data: m } = await db.from("mail_outbox").select("id,tries,kind,subject,recipients").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "Không có mail " + id);
  const tries = (m.tries ?? 0) + 1;
  const upd = b.ok
    ? { status: "SENT", sent_at: new Date().toISOString(), tries, error: null }
    : { status: tries >= 3 ? "ERROR" : "QUEUED", tries, error: String(b.error ?? "").slice(0, 500) };
  await db.from("mail_outbox").update(upd).eq("id", id);
  await db.from("email_logs").insert({
    kind: m.kind, recipients: m.recipients, subject: m.subject,
    status: b.ok ? "SENT_OUTLOOK" : "ERROR_OUTLOOK", error: b.ok ? null : String(b.error ?? "").slice(0, 500),
  });
  return NextResponse.json({ ok: true, status: upd.status });
});
