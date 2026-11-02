import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { sendDailyEmail } from "@/lib/email/dailyPlan";
import { todayVN } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron 09:00 giờ VN (02:00 UTC), Thứ 2–7 – "hạn chờ".
 * Nếu hôm nay chưa gửi được email kế hoạch (kho gửi báo cáo muộn, hoặc 08:00 gửi lỗi)
 * → gửi bù theo kế hoạch hiện có. Email tự kèm cảnh báo "báo cáo kho chưa cập nhật".
 */
export const GET = handle(async (req: Request) => {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    throw new HttpError(401, "Unauthorized");
  const s = await loadSettings();
  if (!s.email_enabled) return NextResponse.json({ skipped: "email_enabled = false" });
  if (s.last_email_date === todayVN()) return NextResponse.json({ skipped: "Đã gửi hôm nay" });
  try {
    return NextResponse.json({ date: todayVN(), email: await sendDailyEmail(s) });
  } catch (e) {
    return NextResponse.json({ date: todayVN(), email: { error: e instanceof Error ? e.message : String(e) } });
  }
});
