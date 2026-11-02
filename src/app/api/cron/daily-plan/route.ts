import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { runPlanning } from "@/lib/engine/process";
import { lastImportDateVN, sendDailyEmail } from "@/lib/email/dailyPlan";
import { todayVN, weekdayVN } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron 08:00 giờ VN (01:00 UTC), Thứ 2–7.
 * 1) Lập lại kế hoạch theo ngày mới (lô vào cửa sổ 14 ngày, lô hết hạn bị hủy)
 * 2) Gửi email Daily Plan nếu bật (cách gửi CRON) – mỗi ngày tối đa 1 lần (?force=1 để gửi lại)
 * Lỗi ở bước 1 không chặn bước 2 (email vẫn gửi theo kế hoạch hiện có).
 */
export const GET = handle(async (req: Request) => {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    throw new HttpError(401, "Unauthorized");
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (weekdayVN() === 0 && !force) return NextResponse.json({ skipped: "Chủ nhật" });

  let s = await loadSettings();
  let plan: unknown;
  try {
    plan = await runPlanning(supabaseAdmin(), s, null);
  } catch (e) {
    plan = { error: e instanceof Error ? e.message : String(e) };
  }
  s = await loadSettings();
  let email: unknown = { skipped: "email_enabled = false" };
  // Chế độ "sau khi nạp báo cáo kho": 08:00 chỉ gửi nếu hôm nay đã nạp xong; chưa nạp → chờ, 09:00 gửi bù
  if (s.email_enabled && s.email_trigger === "AFTER_IMPORT" && !force && lastImportDateVN(s) !== todayVN()) {
    email = { skipped: "Chờ nạp Daily Stock Report (gửi bù lúc 09:00 nếu chưa có)" };
  } else if (s.email_enabled) {
    try {
      email = await sendDailyEmail(s, { force });
    } catch (e) {
      email = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ date: todayVN(), plan, email });
});
