/**
 * Dựng thử email Daily Plan từ kế hoạch trong file Excel (không cần DB, không gửi).
 *   npx tsx scripts/test-email.ts <fixture.json> <today> > preview.html
 */
import { readFileSync } from "node:fs";
import { buildDailyEmailContent } from "../src/lib/email/template";
import { addDays, diffDays } from "../src/lib/dates";
import type { PlanView, Settings } from "../src/lib/types";

const [fx, today = "2026-10-20"] = process.argv.slice(2);
const F = JSON.parse(readFileSync(fx, "utf8"));
const s = {
  hum_limit: 6.5, sample_rate: 0.02, readings_per_carton: 3, email_days_ahead: 3, form_warehouse: "EHV – FG Warehouse",
  last_imported_file: "bao-cao_2026-10-19.xlsx", preship_deadline: 5,
} as Settings;
const plans = (F.plan as unknown[][]).map((p) => {
  const insp_by = addDays(String(p[5]), -5);
  return {
    plan_id: p[9], brand_code: p[0], jo: p[1], buyer_po: p[2], cartons: p[3], bpo_date: p[5], stock_in_date: p[6], sched_date: p[7],
    locations: p[13], trigger: p[15], sample_cartons: p[18], cartons_tested: 0, lot_result: "PENDING",
    priority: today > insp_by || String(p[7]) > insp_by ? "LATE" : "ON TIME",
  } as unknown as PlanView;
});
// thêm 1 lô ở tương lai để kiểm tra phần "xếp lịch N ngày tới"
plans.push({ ...plans[0], plan_id: "HI-261022-001", jo: "TEST-FUTURE", sched_date: addDays(today, 2), bpo_date: addDays(today, 9), priority: "ON TIME" });
const m = buildDailyEmailContent({ plans, s, today, appUrl: "https://kiem-am-thv.vercel.app", openCapa: 2, lastImportDate: "2026-10-19" });
console.error(`subject: ${m.subject}\ndue: ${m.due.length} · late: ${m.late} · upcoming: ${m.upcoming.length} · stale: ${m.stale} (import ${diffDays(today, "2026-10-19")} ngày trước)`);
const m2 = buildDailyEmailContent({ plans, s, today, appUrl: "", openCapa: 0, lastImportDate: "2026-10-16" });
console.error(`stale khi báo cáo 16/10: ${m2.stale} · không có link khi thiếu APP_URL: ${!m2.html.includes("href=\"/m/")}`);
console.error(`text:\n${m.text.split("\n").slice(0, 6).join("\n")}`);
process.stdout.write(m.html);
