import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { loadSettings } from "@/lib/settings";
import { sendDailyEmail } from "@/lib/email/dailyPlan";

export const runtime = "nodejs";
export const maxDuration = 60;

/** { toMe: true } → gửi thử cho người bấm ; { now: true } → gửi ngay cho danh sách (gửi lại dù hôm nay đã gửi) */
export const POST = handle(async (req: Request) => {
  const user = await requireRole(CAN_PLAN);
  const { toMe, now } = (await req.json().catch(() => ({}))) as { toMe?: boolean; now?: boolean };
  const s = await loadSettings();
  if (toMe) {
    if (!user.email) throw new Error("Tài khoản không có email");
    return NextResponse.json(await sendDailyEmail(s, { testTo: user.email }));
  }
  return NextResponse.json(await sendDailyEmail(s, { force: !!now }));
});
