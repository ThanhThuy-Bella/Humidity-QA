import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "../types";
import { fetchAll, insertChunked } from "../supabase/admin";
import { toIsoDate, yymmdd } from "../dates";
import { fmtReading, lotKey, numVal, roundUp, textOf } from "../format";

/**
 * Port ImportLegacyHumidityReport (VBA mục 9). Đọc HUMIDITY_REPORT_*.xlsx (layout Sheet1):
 * tìm dòng tiêu đề có "Audit carton no", số đo = các cột giữa "Actual humidity" và "Result",
 * "4,5" → 4.5, bỏ dòng trùng (ngày + JO + BPO).
 */
function val(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return o.result;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
  }
  return v;
}

export async function importLegacyReport(db: SupabaseClient, s: Settings, buffer: Buffer, fileName: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const H = (r: number, c: number) => String(val(ws.getRow(r).getCell(c).value) ?? "").replace(/\n/g, " ").toUpperCase();

  let hdr = 0;
  for (let r = 1; r <= 12 && !hdr; r++) for (let c = 1; c <= 30; c++) if (H(r, c).includes("AUDIT CARTON")) { hdr = r; break; }
  if (!hdr) throw new Error("Không thấy tiêu đề 'Audit carton no' trong 12 dòng đầu.");

  const col: Record<string, number> = {};
  for (let c = 1; c <= 30; c++) {
    const h = H(hdr, c);
    const t = h.trim();
    if (t.startsWith("DATE") && !col.d) col.d = c;
    if (t.startsWith("BUYER")) col.b = c;
    if (t === "JO") col.j = c;
    if (t.startsWith("COLOR")) col.col = c;
    if (t === "BPO") col.bpo = c;
    if (h.includes("STOCK IN")) col.in = c;
    if (h.includes("EX-FTY")) col.ex = c;
    if (h.includes("TOTAL CARTON")) col.tot = c;
    if (h.includes("AUDIT CARTON")) col.aud = c;
    if (h.includes("Q'TY IN CARTON")) col.qic = c;
    if (h.includes("ACTUAL HUMIDITY")) col.h1 = c;
    if (h.includes("RESULT")) col.res = c;
    if (t.startsWith("QA")) col.qa = c;
    if (h.includes("REWORK")) col.rw = c;
  }
  if (!col.d || !col.j || !col.h1 || !col.res || !col.tot)
    throw new Error("Thiếu cột bắt buộc (Date, JO, Total carton, Actual humidity, Result).");

  const existing = await fetchAll<{ plan_id: string; inspection_date: string; jo: string; bpo: string | null }>((a, b) =>
    db.from("inspection_history").select("plan_id,inspection_date,jo,bpo").range(a, b),
  );
  const exist = new Set(existing.map((h) => `${h.inspection_date}|${lotKey(h.jo, h.bpo ?? "")}`));
  const seq = new Map<string, number>();
  for (const h of existing) {
    const m = h.plan_id.match(/^LEG-(\d{6})-(\d+)$/);
    if (m) seq.set(m[1], Math.max(seq.get(m[1]) ?? 0, Number(m[2])));
  }

  const out: object[] = [];
  const rpc = s.readings_per_carton;
  for (let r = hdr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (c?: number) => (c ? val(row.getCell(c).value) : null);
    const jo = textOf(g(col.j));
    const d = toIsoDate(g(col.d));
    if (!jo || !d) continue;
    const bpo = col.bpo ? textOf(g(col.bpo)) : "";
    const key = `${d}|${lotKey(jo, bpo)}`;
    if (exist.has(key)) continue;
    exist.add(key);

    const rd: number[] = [];
    for (let c = col.h1; c < col.res; c++) {
      const x = numVal(g(c));
      if (x !== null) rd.push(x);
    }
    let txt = "";
    rd.forEach((x, i) => (txt += (i === 0 ? "" : i % rpc === 0 ? " | " : "/") + fmtReading(x)));
    const tot = Number(g(col.tot)) || 0;
    const req = roundUp(tot * s.sample_rate);
    const tested = roundUp(rd.length / rpc);
    const mx = rd.length ? Math.max(...rd) : null;
    const k = yymmdd(d);
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    out.push({
      plan_id: `LEG-${k}-${String(n).padStart(3, "0")}`, inspection_date: d,
      brand_code: col.b ? textOf(g(col.b)) : null, jo, color: col.col ? textOf(g(col.col)) : null, bpo,
      stock_in_date: col.in ? toIsoDate(g(col.in)) : null, exfty_date: col.ex ? toIsoDate(g(col.ex)) : null,
      total_cartons: tot, audit_carton_no: col.aud ? textOf(g(col.aud)) : null, qty_in_carton: col.qic ? textOf(g(col.qic)) : null,
      readings: txt, reading_count: rd.length, cartons_tested: tested, sample_required: req,
      sampling_check: rd.length ? (tested >= req ? "OK" : "UNDER") : null, max_humidity: mx,
      avg_humidity: rd.length ? Math.round((rd.reduce((a, b) => a + b, 0) / rd.length) * 100) / 100 : null,
      result: rd.length === 0 ? "NO DATA" : mx! <= s.hum_limit ? "PASS" : "FAIL",
      qa: col.qa ? textOf(g(col.qa)) || null : null, rework_humidity: col.rw ? numVal(g(col.rw)) : null,
      trigger: "LEGACY", source: fileName,
    });
  }
  await insertChunked(db, "inspection_history", out);
  return out.length;
}
