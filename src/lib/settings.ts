import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import type { Settings } from "./types";
import { todayVN } from "./dates";
import { EMAIL_DEFAULTS } from "./email/defaults";

export async function loadSettings(): Promise<Settings> {
  const { data, error } = await supabaseAdmin().from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error("Không đọc được Settings: " + error.message);
  const s = data as Settings;
  for (const k of ["hum_limit", "sample_rate"] as const) s[k] = Number(s[k]); // numeric → string
  // DB cũ chưa chạy 0002_auto_mail.sql → dùng mặc định
  if (s.email_trigger !== "AFTER_IMPORT") s.email_trigger = "CRON";
  if (!Array.isArray(s.email_send_days)) s.email_send_days = [1, 2, 3, 4, 5, 6];
  if (typeof s.email_notify_ahead !== "boolean") s.email_notify_ahead = true;
  if (!s.email_subject_tpl) s.email_subject_tpl = EMAIL_DEFAULTS.subject;
  if (s.email_intro == null) s.email_intro = EMAIL_DEFAULTS.intro;
  if (s.email_signature == null) s.email_signature = EMAIL_DEFAULTS.signature;
  if (!Number.isInteger(s.insp_wave_weekday) || s.insp_wave_weekday < 1 || s.insp_wave_weekday > 6) s.insp_wave_weekday = 1;
  if (typeof s.max_cartons_per_day !== "number" || s.max_cartons_per_day < 0) s.max_cartons_per_day = 40;
  return s;
}

/** PlanDate: ngày cố định trong Settings hoặc hôm nay (giờ VN) */
export function planDateOf(s: Settings): string {
  return s.plan_date_override || todayVN();
}

export function isRainMonth(s: Settings, month: number) {
  return month >= s.rain_start && month <= s.rain_end;
}
