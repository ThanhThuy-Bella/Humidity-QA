import "server-only";
import nodemailer from "nodemailer";
import type { Settings } from "../types";
import { todayVN, weekdayVN } from "../dates";
import { loadSettings } from "../settings";
import { dueLots, openPlans } from "../queries";
import { exportForm, toBuffer } from "../excel/export";
import { supabaseAdmin } from "../supabase/admin";
import { buildDailyEmailContent, buildNoticeEmailContent, isNewLot, nextSendDay } from "./template";

/** Lần gửi thành công gần nhất (email ngày hoặc báo trước) – mốc đánh dấu lô MỚI */
async function lastSentAt(): Promise<string | null> {
  const { data } = await supabaseAdmin().from("email_logs").select("sent_at")
    .in("kind", ["DAILY", "NOTICE"]).eq("status", "SENT").order("sent_at", { ascending: false }).limit(1);
  return data?.[0]?.sent_at ?? null;
}

/** Gom dữ liệu từ DB → nội dung email */
export async function buildDailyEmail(s: Settings) {
  const db = supabaseAdmin();
  const today = todayVN();
  const [plans, { count }, newSince] = await Promise.all([
    openPlans(),
    db.from("capa").select("id", { count: "exact", head: true }).not("status", "in", "(CLOSED,CANCELLED)"),
    lastSentAt(),
  ]);
  const lastImportDate = s.last_import_time
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(s.last_import_time))
    : null;
  const mail = buildDailyEmailContent({
    plans, s, today, appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, ""), openCapa: count ?? 0, lastImportDate, newSince,
  });
  const formRows = dueLots(plans, today, false);
  const attachment = await toBuffer(await exportForm(formRows, s, today));
  return { ...mail, attachment, fileName: `HUMIDITY_CHECKING_PLAN_${today.slice(8, 10)}-${today.slice(5, 7)}-${today.slice(0, 4)}.xlsx` };
}

type Mail = { to: string[]; cc?: string[]; subject: string; html: string; text: string; attachment?: Buffer; fileName?: string };

export type SmtpConf = { provider: string; host: string; port: number; secure: boolean; user: string; pass: string; from: string; source: "env" | "db" };

/**
 * Cấu hình hộp thư gửi. v1.8: ưu tiên biến môi trường Vercel; nếu chưa có thì đọc bảng `mail_secret`
 * (Supabase, chỉ server đọc được – RLS bật, không có policy) → chị cài bằng SQL, không cần đụng Vercel.
 */
export async function smtpConfig(): Promise<SmtpConf | null> {
  const e = process.env;
  if (e.SMTP_HOST || e.RESEND_API_KEY) {
    return {
      provider: e.EMAIL_PROVIDER ?? "smtp", host: e.SMTP_HOST ?? "", port: Number(e.SMTP_PORT ?? 587),
      secure: e.SMTP_SECURE === "true", user: e.SMTP_USER ?? "", pass: e.SMTP_PASS ?? "",
      from: e.MAIL_FROM ?? e.SMTP_USER ?? "", source: "env",
    };
  }
  try {
    const { data } = await supabaseAdmin().from("mail_secret").select("*").eq("id", 1).maybeSingle();
    if (data?.smtp_host) {
      return {
        provider: "smtp", host: String(data.smtp_host).trim(), port: Number(data.smtp_port ?? 587),
        secure: !!data.smtp_secure, user: String(data.smtp_user ?? "").trim(), pass: String(data.smtp_pass ?? ""),
        from: String(data.mail_from || data.smtp_user || "").trim(), source: "db",
      };
    }
  } catch { /* bảng chưa tạo */ }
  return null;
}

/** Gửi qua SMTP (Office 365 / Gmail) hoặc Resend */
async function deliver(m: Mail) {
  const c = await smtpConfig();
  if (!c) throw new Error("Chưa cấu hình hộp thư gửi (chạy SQL mail_secret trong Supabase hoặc thêm biến SMTP_* trên Vercel).");
  if (!c.from) throw new Error("Chưa cấu hình MAIL_FROM.");
  if (c.provider === "resend") {
    if (!process.env.RESEND_API_KEY) throw new Error("Chưa cấu hình RESEND_API_KEY.");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: c.from, to: m.to, cc: m.cc?.length ? m.cc : undefined, subject: m.subject, html: m.html, text: m.text,
        attachments: m.attachment ? [{ filename: m.fileName, content: m.attachment.toString("base64") }] : undefined,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return;
  }
  if (!c.host) throw new Error("Chưa cấu hình SMTP_HOST.");
  const transport = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
  });
  await transport.sendMail({
    from: c.from, to: m.to, cc: m.cc?.length ? m.cc : undefined, subject: m.subject, html: m.html, text: m.text,
    attachments: m.attachment ? [{ filename: m.fileName, content: m.attachment }] : [],
  });
}

/**
 * kind DAILY: gửi danh sách trong Cài đặt, mỗi ngày tối đa 1 lần (trừ khi force).
 * kind TEST : gửi cho 1 địa chỉ (người bấm), không đánh dấu đã gửi.
 */
export async function sendDailyEmail(s: Settings, opts: { testTo?: string; force?: boolean } = {}) {
  const db = supabaseAdmin();
  const today = todayVN();
  const isTest = !!opts.testTo;
  const to = isTest ? [opts.testTo!] : s.email_recipients;
  if (!to.length) throw new Error("Chưa cấu hình người nhận email trong Cài đặt.");
  if (!isTest && !opts.force && s.last_email_date === today) return { sent: false, reason: "Đã gửi hôm nay rồi" };
  if (!isTest && !opts.force && !s.email_send_days.includes(weekdayVN(today)))
    return { sent: false, reason: "Hôm nay không nằm trong ngày gửi (Cài đặt)" };

  const mail = await buildDailyEmail(s);
  if (!isTest && s.email_skip_empty && mail.due.length === 0 && mail.upcoming.length === 0) {
    await db.from("email_logs").insert({ kind: "DAILY", recipients: to, subject: mail.subject, lot_count: 0, status: "SKIPPED_EMPTY" });
    return { sent: false, reason: "Không có lô nào – bỏ qua theo cài đặt" };
  }
  try {
    await deliver({
      to, cc: isTest ? undefined : s.email_cc, subject: (isTest ? "[THỬ] " : "") + mail.subject,
      html: mail.html, text: mail.text, attachment: mail.attachment, fileName: mail.fileName,
    });
    await db.from("email_logs").insert({ kind: isTest ? "TEST" : "DAILY", recipients: to, subject: mail.subject, lot_count: mail.due.length, status: "SENT" });
    if (!isTest) await db.from("settings").update({ last_email_date: today }).eq("id", 1);
    return { sent: true, subject: mail.subject, lots: mail.due.length, stale: mail.stale };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("email_logs").insert({ kind: isTest ? "TEST" : "DAILY", recipients: to, subject: mail.subject, lot_count: mail.due.length, status: "ERROR", error: msg.slice(0, 500) });
    throw new Error("Gửi email lỗi: " + msg);
  }
}

/**
 * Gọi sau khi nạp xong Daily Stock Report (upload / Power Automate).
 * Chỉ gửi khi bật email + chọn "Gửi ngay sau khi nạp báo cáo kho". Không bao giờ ném lỗi
 * (lỗi gửi mail không làm hỏng kết quả nạp báo cáo – đã ghi vào email_logs).
 */
export async function sendAfterImport(): Promise<unknown> {
  try {
    const s = await loadSettings(); // đọc lại: last_import_time vừa đổi
    if (!s.email_enabled) return { skipped: "Chưa bật gửi email tự động" };
    // Chế độ "sau khi nạp": lần nạp đầu tiên trong ngày → gửi email ngày
    if (s.email_trigger === "AFTER_IMPORT" && s.last_email_date !== todayVN()) return await sendDailyEmail(s);
    // Đã gửi email ngày rồi → nếu nạp lại phát sinh lô mới đến ngày gửi kế tiếp thì gửi "Báo trước"
    return await sendNewLotNotice(s);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Ngày (giờ VN) của lần nạp báo cáo kho gần nhất */
export function lastImportDateVN(s: Settings): string | null {
  return s.last_import_time
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(s.last_import_time))
    : null;
}

/**
 * "Gửi trước kế hoạch 1 ngày khi có kế hoạch mới":
 * email ngày hôm nay đã gửi, sau đó nạp báo cáo kho tạo thêm lô cần kiểm đến ngày gửi kế tiếp
 * → gửi email Báo trước chỉ gồm các lô mới đó. (Trước khi gửi email ngày thì email ngày đã gồm sẵn.)
 */
export async function sendNewLotNotice(s: Settings) {
  const db = supabaseAdmin();
  const today = todayVN();
  if (!s.email_notify_ahead) return { skipped: "Không bật báo trước kế hoạch mới" };
  if (s.last_email_date !== today) return { skipped: "Chưa gửi email ngày – email ngày sẽ gồm lô mới" };
  if (!s.email_send_days.includes(weekdayVN(today))) return { skipped: "Hôm nay không nằm trong ngày gửi" };
  const to = s.email_recipients;
  if (!to.length) return { skipped: "Chưa có người nhận" };
  const since = await lastSentAt();
  const nextDay = nextSendDay(today, s.email_send_days);
  const lots = (await openPlans())
    .filter((p) => p.lot_result === "PENDING" && p.sched_date <= nextDay && isNewLot(p, since))
    .sort((a, b) => a.sched_date.localeCompare(b.sched_date) || a.brand_code.localeCompare(b.brand_code));
  if (!lots.length) return { skipped: "Không có lô mới" };
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const mail = buildNoticeEmailContent({ lots, s, today, nextDay, appUrl });
  try {
    await deliver({ to, cc: s.email_cc, subject: mail.subject, html: mail.html, text: mail.text });
    await db.from("email_logs").insert({ kind: "NOTICE", recipients: to, subject: mail.subject, lot_count: lots.length, status: "SENT" });
    return { sent: true, notice: true, subject: mail.subject, lots: lots.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("email_logs").insert({ kind: "NOTICE", recipients: to, subject: mail.subject, lot_count: lots.length, status: "ERROR", error: msg.slice(0, 500) });
    return { error: "Gửi email báo trước lỗi: " + msg };
  }
}
