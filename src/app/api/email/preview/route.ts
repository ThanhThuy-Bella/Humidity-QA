import { ANY, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { loadSettings } from "@/lib/settings";
import { buildDailyEmail } from "@/lib/email/dailyPlan";

export const runtime = "nodejs";

/** Xem trước email Daily Plan trong trình duyệt (không gửi) */
export const GET = handle(async () => {
  await requireRole(ANY);
  const m = await buildDailyEmail(await loadSettings());
  const banner = `<div style="font:13px Segoe UI,Arial;background:#1E2A33;color:#fff;padding:8px 16px">XEM TRƯỚC · Tiêu đề: <b>${m.subject.replace(/</g, "&lt;")}</b> · Đính kèm: ${m.fileName}</div>`;
  return new Response(m.html.replace("<body", banner + "<body"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
