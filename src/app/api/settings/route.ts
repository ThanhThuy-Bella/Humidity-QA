import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

const NUM = ["hum_limit", "sample_rate", "readings_per_carton", "rain_start", "rain_end", "iso_weeks_rain", "iso_weeks_dry",
  "preship_earliest", "preship_deadline", "plan_lookahead", "email_days_ahead", "insp_wave_weekday", "max_cartons_per_day"] as const;
const TXT = ["grade_filter", "warehouse_sheet", "mail_subject", "form_warehouse", "company_name", "company_address", "company_tel"] as const;

export const PUT = handle(async (req: Request) => {
  const user = await requireRole(CAN_PLAN);
  const b = (await req.json()) as Record<string, unknown>;
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of NUM) if (k in b) {
    const v = Number(b[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`Giá trị ${k} không hợp lệ`);
    upd[k] = v;
  }
  for (const m of ["rain_start", "rain_end"] as const)
    if (upd[m] !== undefined && (Number(upd[m]) < 1 || Number(upd[m]) > 12)) throw new Error("Tháng phải từ 1 đến 12");
  if (upd.insp_wave_weekday !== undefined && (!Number.isInteger(upd.insp_wave_weekday) || Number(upd.insp_wave_weekday) < 1 || Number(upd.insp_wave_weekday) > 6))
    throw new Error("Ngày đợt kiểm: 1 = Thứ 2 … 6 = Thứ 7");
  if (upd.readings_per_carton !== undefined && Number(upd.readings_per_carton) !== 3)
    throw new Error("Hiện form nhập hỗ trợ đúng 3 số đo / thùng");
  if (upd.sample_rate !== undefined && (Number(upd.sample_rate) <= 0 || Number(upd.sample_rate) > 1))
    throw new Error("Tỷ lệ mẫu phải trong (0, 1] – ví dụ 0.02");
  for (const k of TXT) if (k in b) upd[k] = String(b[k] ?? "").trim();
  if ("email_subject_tpl" in b) {
    const v = String(b.email_subject_tpl ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!v) throw new Error("Tiêu đề email không được để trống");
    if (v.length > 200) throw new Error("Tiêu đề email tối đa 200 ký tự");
    upd.email_subject_tpl = v;
  }
  for (const k of ["email_intro", "email_signature"] as const) if (k in b) {
    const v = String(b[k] ?? "").replace(/\r\n/g, "\n").trim();
    if (v.length > 2000) throw new Error("Nội dung email tối đa 2000 ký tự");
    upd[k] = v;
  }
  if ("plan_date_override" in b) upd.plan_date_override = b.plan_date_override || null;
  if ("email_enabled" in b) upd.email_enabled = !!b.email_enabled;
  if ("email_skip_empty" in b) upd.email_skip_empty = !!b.email_skip_empty;
  if ("email_notify_ahead" in b) upd.email_notify_ahead = !!b.email_notify_ahead;
  if ("email_trigger" in b) {
    if (b.email_trigger !== "CRON" && b.email_trigger !== "AFTER_IMPORT") throw new Error("Cách gửi email không hợp lệ");
    upd.email_trigger = b.email_trigger;
  }
  if ("email_send_days" in b) {
    const d = Array.isArray(b.email_send_days) ? b.email_send_days.map(Number) : [];
    if (d.some((x) => !Number.isInteger(x) || x < 1 || x > 6)) throw new Error("Ngày gửi chỉ từ Thứ 2 đến Thứ 7");
    upd.email_send_days = Array.from(new Set(d)).sort();
  }
  for (const k of ["email_recipients", "email_cc"] as const) if (k in b) {
    const list = String(b[k] ?? "").split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
    for (const e of list) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error(`Email không hợp lệ: ${e}`);
    upd[k] = list;
  }
  const db = supabaseAdmin();
  const { error } = await db.from("settings").update(upd).eq("id", 1);
  if (error) throw new Error(error.message);
  await db.from("activity_log").insert({ action: "SETTINGS", detail: upd, user_id: user.id });
  return NextResponse.json({ ok: true });
});
