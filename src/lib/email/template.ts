/**
 * Nội dung email Daily Plan – hàm THUẦN (không DB) để xem trước & test.
 * Gồm: lô cần kiểm hôm nay (gồm trễ, LATE lên đầu), lô ngày gửi kế tiếp (báo trước 1 ngày, lô MỚI đánh dấu),
 * lô xếp lịch các ngày sau (đến N ngày tới),
 * cảnh báo báo cáo kho chưa cập nhật, số CAPA đang mở. Mỗi JO có link mở form nhập trên điện thoại.
 */
import type { PlanView, Settings } from "../types";
import { addDays, diffDays, fmtDate } from "../dates";
import { EMAIL_DEFAULTS, fillVars } from "./defaults";
import { waveOnOrAfter } from "../engine/rules";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface DailyEmailInput {
  plans: PlanView[];
  s: Settings;
  today: string;
  appUrl: string;
  openCapa: number;
  lastImportDate: string | null; // ngày (VN) của lần nạp báo cáo kho gần nhất
  newSince?: string | null;       // thời điểm gửi email gần nhất – lô tạo sau mốc này đánh dấu MỚI
}

/** Ngày gửi kế tiếp sau `today` theo email_send_days (0=CN…6=T7). Thứ 7 → Thứ 2 nếu CN không gửi. */
export function nextSendDay(today: string, days: number[]): string {
  const set = days.length ? days : [1, 2, 3, 4, 5, 6];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (set.includes(new Date(d + "T00:00:00Z").getUTCDay())) return d;
  }
  return addDays(today, 1);
}

export const isNewLot = (p: PlanView, since: string | null | undefined) =>
  !!since && !!p.created_at && new Date(p.created_at).getTime() > new Date(since).getTime();

export interface DailyEmail {
  subject: string;
  html: string;
  text: string;
  due: PlanView[];
  upcoming: PlanView[];   // = nextDay + later
  target: string;        // v1.9: ngày đợt kiểm của email (Thứ 2)
  nextDay: string;
  nextDayLots: PlanView[];
  later: PlanView[];
  late: number;
  stale: boolean;
}

function dueOf(plans: PlanView[], d: string) {
  const ok = new Set(["PENDING", "IN PROGRESS", "FAIL"]);
  return plans
    .filter((p) => p.sched_date <= d && ok.has(p.lot_result))
    .sort((a, b) => (a.priority === "LATE" ? 0 : 1) - (b.priority === "LATE" ? 0 : 1)
      || a.sched_date.localeCompare(b.sched_date) || a.brand_code.localeCompare(b.brand_code));
}

const STATUS_VN: Record<string, string> = { PENDING: "Chờ kiểm", "IN PROGRESS": "Đang kiểm", FAIL: "FAIL – chưa đủ mẫu", PASS: "PASS" };

function table(rows: PlanView[], appUrl: string, newSince?: string | null) {
  if (!rows.length) return `<p style="color:#4A5A66;font-size:13px">Không có lô nào.</p>`;
  const th = (t: string, right = false) =>
    `<th style="text-align:${right ? "right" : "left"};padding:6px 8px;background:#F2F9FB;color:#0E6F8A;border-bottom:1px solid #DBE3E8;font-size:12px;white-space:nowrap">${t}</th>`;
  const td = (t: string, extra = "") => `<td style="padding:6px 8px;border-bottom:1px solid #EDF1F3;font-size:12px;${extra}">${t}</td>`;
  const R = "text-align:right;font-variant-numeric:tabular-nums";
  return `<table role="presentation" style="border-collapse:collapse;width:100%;font-family:Segoe UI,Arial,sans-serif">
  <tr>${th("Ngày kiểm")}${th("Ưu tiên")}${th("Brand")}${th("JO")}${th("Buyer PO")}${th("Thùng", true)}${th("Mẫu", true)}${th("Đã đo", true)}${th("Trạng thái")}${th("Vị trí")}${th("BPO date")}</tr>
  ${rows.map((p) => `<tr>
    ${td(fmtDate(p.sched_date))}
    ${td(p.priority === "LATE" ? "Trễ hạn" : p.priority === "ON TIME" ? "Đúng hạn" : esc(p.priority), p.priority === "LATE" ? "color:#D64545;font-weight:600" : "color:#2E9E5B")}
    ${td(esc(p.brand_code))}
    ${td((appUrl ? `<a href="${appUrl}/m/lot/${encodeURIComponent(p.plan_id)}" style="color:#0E6F8A;font-weight:600">${esc(p.jo)}</a>` : `<b>${esc(p.jo)}</b>`)
      + (isNewLot(p, newSince) ? ` <span style="background:#D64545;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px">MỚI</span>` : ""))}
    ${td(esc(p.buyer_po))}
    ${td(String(p.cartons), R)}
    ${td(String(p.sample_cartons), R)}
    ${td(String(p.cartons_tested), R)}
    ${td(STATUS_VN[p.lot_result] ?? esc(p.lot_result), p.lot_result === "FAIL" ? "color:#D64545;font-weight:600" : "")}
    ${td(esc(p.locations))}
    ${td(fmtDate(p.bpo_date))}
  </tr>`).join("")}
  </table>`;
}

export function buildDailyEmailContent({ plans, s, today, appUrl, openCapa, lastImportDate, newSince }: DailyEmailInput): DailyEmail {
  // v1.9: email theo ĐỢT KIỂM – Thứ 7 gửi plan cho đợt Thứ 2 tuần sau (gồm lô dời sang T3… do quá tải, lô trễ)
  const target = waveOnOrAfter(today, s.insp_wave_weekday ?? 1);
  const weekEnd = addDays(target, 6);
  const due = dueOf(plans, weekEnd);
  const nextDay = addDays(target, 7);
  const upcoming = plans
    .filter((p) => p.sched_date > weekEnd && p.sched_date <= addDays(weekEnd, 7) && p.lot_result === "PENDING")
    .sort((a, b) => a.sched_date.localeCompare(b.sched_date) || a.brand_code.localeCompare(b.brand_code));
  const nextDayLots = upcoming;
  const later: PlanView[] = [];
  const until = addDays(weekEnd, 7);
  const newCount = nextDayLots.filter((p) => isNewLot(p, newSince)).length;
  const late = due.filter((p) => p.priority === "LATE").length;
  // báo cáo kho coi là cũ nếu ngày nạp gần nhất trước hôm qua (Thứ 2 cho phép báo cáo Thứ 7)
  const maxAge = new Date(today + "T00:00:00Z").getUTCDay() === 1 ? 2 : 1;
  const stale = !lastImportDate || diffDays(today, lastImportDate) > maxAge;

  const vars = { ngay: fmtDate(target), so_lo: due.length, so_tre: late, ngay_mai: fmtDate(nextDay), so_lo_mai: nextDayLots.length, so_capa: openCapa };
  const subject = fillVars(s.email_subject_tpl || EMAIL_DEFAULTS.subject, vars).replace(/\s*\(0 trễ hạn\)/, "").trim();
  const para = (t: string) => esc(fillVars(t, vars)).replace(/\r?\n/g, "<br>");
  const intro = (s.email_intro ?? EMAIL_DEFAULTS.intro).trim();
  const sign = (s.email_signature ?? EMAIL_DEFAULTS.signature).trim();
  const warn = stale
    ? `<div style="background:#FFFBE6;border:1px solid #E8C770;color:#7A5200;padding:8px 12px;border-radius:4px;font-size:13px;margin-bottom:12px">
        Báo cáo kho chưa được cập nhật (lần nạp gần nhất: ${lastImportDate ? fmtDate(lastImportDate) : "chưa có"}). Kế hoạch dưới đây có thể thiếu lô mới.
        ${appUrl ? `<a href="${appUrl}/import" style="color:#0E6F8A">Cập nhật báo cáo kho</a>` : ""}</div>`
    : "";
  const capaLine = ""; // v1.7: bỏ CAPA khỏi email

  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#EEF3F6;padding:16px">
<div style="font-family:Segoe UI,Arial,sans-serif;color:#1E2A33;max-width:980px;margin:0 auto">
  <div style="background:#1693B5;color:#fff;padding:14px 18px;border-radius:6px 6px 0 0">
    <div style="font-size:18px;font-weight:700">Kế hoạch kiểm ẩm – đợt ${fmtDate(target)}</div>
    <div style="font-size:12px;opacity:.9">${esc(s.form_warehouse)} · Báo cáo kho: ${esc(s.last_imported_file ?? "—")}</div>
  </div>
  <div style="background:#fff;border:1px solid #DBE3E8;border-top:0;padding:16px 18px;border-radius:0 0 6px 6px">
    ${warn}
    ${intro ? `<p style="font-size:14px;line-height:1.55;margin:0 0 14px">${para(intro)}</p>` : ""}
    <p style="font-size:14px;margin:0 0 12px"><b style="font-size:22px;color:#0E6F8A">${due.length}</b> lô cần kiểm đợt ${fmtDate(target)} ·
      <b style="color:#D64545">${late}</b> lô trễ hạn · <b>${nextDayLots.length}</b> lô đợt sau ${fmtDate(nextDay)}${newCount ? ` (<b style="color:#D64545">${newCount} mới</b>)` : ""}${capaLine}</p>
    <h3 style="color:#0E6F8A;font-size:14px;margin:16px 0 6px">Lô cần kiểm đợt ${fmtDate(target)}${s.max_cartons_per_day ? ` (tối đa ${s.max_cartons_per_day} thùng mẫu/ngày – xem cột Ngày kiểm)` : ""}</h3>
    ${table(due, appUrl, newSince)}
    <h3 style="color:#0E6F8A;font-size:14px;margin:20px 0 6px">Báo trước – đợt sau ${fmtDate(nextDay)}</h3>
    ${table(nextDayLots, appUrl, newSince)}
    ${later.length ? `<h3 style="color:#0E6F8A;font-size:14px;margin:20px 0 6px">Xếp lịch các ngày sau (đến ${fmtDate(until)})</h3>
    ${table(later, appUrl, newSince)}` : ""}
    <p style="font-size:12px;color:#4A5A66;margin-top:18px">Chuẩn: độ ẩm ≤ ${s.hum_limit}% = PASS · mẫu ROUNDUP(thùng × ${Math.round(s.sample_rate * 100)}%) · ${s.readings_per_carton} áo/thùng.
      Bấm vào JO để mở form nhập trên điện thoại. Biểu mẫu giấy (kèm QR) đính kèm.</p>
    ${appUrl ? `<p><a href="${appUrl}/m" style="background:#1693B5;color:#fff;padding:9px 16px;border-radius:4px;text-decoration:none;font-size:13px;display:inline-block">Mở danh sách kiểm trên điện thoại</a></p>` : ""}
    ${sign ? `<p style="font-size:14px;line-height:1.55;margin-top:16px">${para(sign)}</p>` : ""}
    <p style="font-size:11px;color:#8A98A3;margin-top:14px">Email tự động từ Humidity Inspection System – không trả lời thư này.</p>
  </div>
</div></body></html>`;

  const line = (p: PlanView) =>
    `- ${fmtDate(p.sched_date)} ${p.priority === "LATE" ? "[TRỄ] " : ""}${p.brand_code} ${p.jo} / ${p.buyer_po} – ${p.sample_cartons} thùng mẫu (${p.cartons_tested} đã đo) ${appUrl ? `${appUrl}/m/lot/${encodeURIComponent(p.plan_id)}` : ""}`;
  const text = [
    ...(intro ? [fillVars(intro, vars), ""] : []),
    `Kế hoạch kiểm ẩm đợt ${fmtDate(target)}: ${due.length} lô cần kiểm, ${late} trễ hạn, ${nextDayLots.length} lô đợt sau ${fmtDate(nextDay)}${newCount ? ` (${newCount} mới)` : ""}.`,
    ...(stale ? [`CẢNH BÁO: báo cáo kho chưa cập nhật (gần nhất ${lastImportDate ? fmtDate(lastImportDate) : "chưa có"}).`] : []),
    "", `LÔ CẦN KIỂM ĐỢT ${fmtDate(target)}:`, ...(due.length ? due.map(line) : ["(không có)"]),
    "", `BÁO TRƯỚC – ĐỢT SAU ${fmtDate(nextDay)}:`, ...(nextDayLots.length ? nextDayLots.map(line) : ["(không có)"]),
    ...(later.length ? ["", `CÁC NGÀY SAU (ĐẾN ${fmtDate(until)}):`, ...later.map(line)] : []),
    ...(sign ? ["", fillVars(sign, vars)] : []),
  ].join("\n");

  if (s.email_via !== "SMTP") return { subject, html: plainHtml(para(intro), sign ? para(sign) : ""), text, due, upcoming, target, nextDay, nextDayLots, later, late, stale };
  return { subject, html, text, due, upcoming, target, nextDay, nextDayLots, later, late, stale };
}

/** v1.11: mail gửi qua Outlook – giống mail chị gửi tay: chỉ lời chào + (chữ ký trong Cài đặt nếu có); Outlook tự thêm chữ ký */
const plainHtml = (body: string, sign: string) =>
  `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;color:#000">${body}${sign ? `<br><br>${sign}` : ""}</div>`;

/**
 * Email "Báo trước kế hoạch mới": gửi khi nạp báo cáo kho SAU lúc đã gửi email ngày hôm nay
 * mà phát sinh lô mới cần kiểm hôm nay / ngày gửi kế tiếp. Chỉ liệt kê các lô mới.
 */
export function buildNoticeEmailContent({ lots, s, today, nextDay, appUrl }:
  { lots: PlanView[]; s: Settings; today: string; nextDay: string; appUrl: string }) {
  // v1.9: PLAN BỔ SUNG – lô gấp không chờ được đợt kiểm kế tiếp. nextDay = ngày kiểm sớm nhất của các lô này.
  const vars = { ngay: fmtDate(nextDay), so_lo: lots.length, so_tre: lots.filter((p) => p.priority === "LATE").length, ngay_mai: fmtDate(nextDay), so_lo_mai: lots.length, so_capa: 0 };
  const base = fillVars(s.email_subject_tpl || EMAIL_DEFAULTS.subject, vars).replace(/\s*\(0 trễ hạn\)/, "").trim();
  const subject = /HUMIDITY CHECKING( PLAN)?/i.test(base) ? base.replace(/HUMIDITY CHECKING( PLAN)?/i, (m) => `${m} BỔ SUNG`) : `[BỔ SUNG] ${base}`;
  const intro = (s.email_intro ?? EMAIL_DEFAULTS.intro).trim();
  const sign = (s.email_signature ?? EMAIL_DEFAULTS.signature).trim();
  const para = (x: string) => esc(fillVars(x, vars)).replace(/\r?\n/g, "<br>");
  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#EEF3F6;padding:16px">
<div style="font-family:Segoe UI,Arial,sans-serif;color:#1E2A33;max-width:980px;margin:0 auto">
  <div style="background:#D97706;color:#fff;padding:14px 18px;border-radius:6px 6px 0 0">
    <div style="font-size:18px;font-weight:700">Plan kiểm ẩm BỔ SUNG – ${fmtDate(nextDay)}</div>
    <div style="font-size:12px;opacity:.9">${esc(s.form_warehouse)} · Báo cáo kho: ${esc(s.last_imported_file ?? "—")}</div>
  </div>
  <div style="background:#fff;border:1px solid #DBE3E8;border-top:0;padding:16px 18px;border-radius:0 0 6px 6px">
    ${intro ? `<p style="font-size:14px;line-height:1.55;margin:0 0 14px">${para(intro)}</p>` : ""}
    <p style="font-size:14px;margin:0 0 12px">Báo cáo kho mới phát sinh <b style="color:#D64545">${lots.length} lô</b> không kịp chờ đợt kiểm kế tiếp
      (kiểm trước BPO − ${s.preship_earliest} ngày). Kho vui lòng hạ thùng theo ngày kiểm trong bảng.</p>
    ${table(lots, appUrl)}
    ${sign ? `<p style="font-size:14px;line-height:1.55;margin-top:16px">${para(sign)}</p>` : ""}
    <p style="font-size:11px;color:#8A98A3;margin-top:14px">Email tự động từ Humidity Inspection System – không trả lời thư này.</p>
  </div>
</div></body></html>`;
  const text = [...(intro ? [fillVars(intro, vars), ""] : []), `PLAN BỔ SUNG: ${lots.length} lô.`, "",
    ...lots.map((p) => `- ${fmtDate(p.sched_date)} ${p.brand_code} ${p.jo} / ${p.buyer_po} – ${p.sample_cartons} thùng mẫu`),
    ...(sign ? ["", fillVars(sign, vars)] : [])].join("\n");
  void today;
  if (s.email_via !== "SMTP") return { subject, html: plainHtml(`<b>PLAN BỔ SUNG</b> (${lots.length} lô gấp)<br><br>${para(intro)}`, sign ? para(sign) : ""), text };
  return { subject, html, text };
}
