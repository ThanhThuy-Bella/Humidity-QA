import "server-only";
import ExcelJS from "exceljs";
import type { Capa, EvaluatedLot, HistoryRow, PlanView, Settings } from "../types";
import { fmtDate } from "../dates";

const TEAL = "FF1693B5";
const PASS_BG = "FFE3F4EA";
const FAIL_BG = "FFFBE6E6";

type Col<T> = { header: string; key: string; width?: number; value: (r: T) => unknown; fmt?: string };

function toDate(iso: unknown): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));

function addTable<T>(ws: ExcelJS.Worksheet, cols: Col<T>[], rows: T[], startRow = 1) {
  const head = ws.getRow(startRow);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = c.width ?? 14;
  });
  head.height = 30;
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = (c.value(r) ?? null) as ExcelJS.CellValue;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.border = { bottom: { style: "hair", color: { argb: "FFDBE3E8" } } };
    });
  });
  ws.views = [{ state: "frozen", ySplit: startRow }];
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: cols.length } };
}

function colorResult(ws: ExcelJS.Worksheet, colIdx: number, from: number, to: number) {
  for (let r = from; r <= to; r++) {
    const c = ws.getRow(r).getCell(colIdx);
    const v = String(c.value ?? "");
    if (v === "PASS" || v === "P") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PASS_BG } };
    if (v === "FAIL" || v === "F") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_BG } };
  }
}

const D = "dd-mmm-yyyy";
const P1 = '0.0"%"';

export async function exportPlan(rows: PlanView[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Humidity_Plan");
  addTable<PlanView>(ws, [
    { header: "Brand Code", key: "b", width: 10, value: (r) => r.brand_code },
    { header: "Ref No (JO)", key: "jo", width: 16, value: (r) => r.jo },
    { header: "Buyer PO", key: "po", width: 16, value: (r) => r.buyer_po },
    { header: "Sum of CARTONS", key: "c", width: 9, value: (r) => r.cartons },
    { header: "Sum of QTY", key: "q", width: 9, value: (r) => Number(r.qty) },
    { header: "BPO date", key: "bpo", value: (r) => toDate(r.bpo_date), fmt: D },
    { header: "In Warehouse Date", key: "in", value: (r) => toDate(r.stock_in_date), fmt: D },
    { header: "Ngày kiểm ẩm", key: "s", value: (r) => toDate(r.sched_date), fmt: D },
    { header: "Số ngày trong kho", key: "dw", width: 9, value: (r) => r.days_in_wh },
    { header: "PlanID", key: "id", width: 15, value: (r) => r.plan_id },
    { header: "Customer", key: "cu", width: 24, value: (r) => r.customer },
    { header: "Style", key: "st", width: 24, value: (r) => r.style },
    { header: "Color", key: "co", width: 18, value: (r) => r.color },
    { header: "Location", key: "lo", width: 16, value: (r) => r.locations },
    { header: "Pallet", key: "pa", width: 22, value: (r) => r.pallets },
    { header: "Trigger", key: "tr", width: 18, value: (r) => r.trigger },
    { header: "AgingWeeks", key: "aw", width: 8, value: (r) => num(r.aging_weeks) },
    { header: "ThresholdWeeks", key: "tw", width: 8, value: (r) => r.threshold_weeks },
    { header: "SampleCartons", key: "sc", width: 8, value: (r) => r.sample_cartons },
    { header: "CartonsTested", key: "ct", width: 8, value: (r) => r.cartons_tested },
    { header: "MaxHumidity", key: "mx", width: 8, value: (r) => num(r.max_humidity), fmt: P1 },
    { header: "LotResult", key: "lr", width: 12, value: (r) => r.lot_result },
    { header: "Kiểm trước ngày (BPO−5)", key: "ib", value: (r) => toDate(r.insp_by), fmt: D },
    { header: "Priority", key: "pr", width: 10, value: (r) => r.priority },
  ], rows);
  colorResult(ws, 22, 2, rows.length + 1);
  return wb;
}

export async function exportHistory(rows: HistoryRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inspection_History");
  addTable<HistoryRow>(ws, [
    { header: "PlanID", key: "id", width: 15, value: (r) => r.plan_id },
    { header: "InspectionDate", key: "d", value: (r) => toDate(r.inspection_date), fmt: D },
    { header: "Brand Code", key: "b", width: 10, value: (r) => r.brand_code },
    { header: "JO", key: "jo", width: 16, value: (r) => r.jo },
    { header: "Color", key: "co", width: 14, value: (r) => r.color },
    { header: "BPO", key: "po", width: 16, value: (r) => r.bpo },
    { header: "StockInDate", key: "in", value: (r) => toDate(r.stock_in_date), fmt: D },
    { header: "ExFtyDate", key: "ex", value: (r) => toDate(r.exfty_date), fmt: D },
    { header: "TotalCartons", key: "tc", width: 9, value: (r) => r.total_cartons },
    { header: "AuditCartonNo", key: "au", width: 14, value: (r) => r.audit_carton_no },
    { header: "QtyInCarton", key: "qi", width: 12, value: (r) => r.qty_in_carton },
    { header: "Readings", key: "rd", width: 28, value: (r) => r.readings },
    { header: "ReadingCount", key: "rc", width: 8, value: (r) => r.reading_count },
    { header: "CartonsTested", key: "ct", width: 8, value: (r) => r.cartons_tested },
    { header: "SampleRequired", key: "sr", width: 8, value: (r) => r.sample_required },
    { header: "SamplingCheck", key: "sk", width: 9, value: (r) => r.sampling_check },
    { header: "MaxHumidity", key: "mx", width: 8, value: (r) => num(r.max_humidity), fmt: P1 },
    { header: "AvgHumidity", key: "av", width: 8, value: (r) => num(r.avg_humidity), fmt: P1 },
    { header: "Result", key: "re", width: 9, value: (r) => r.result },
    { header: "QA", key: "qa", width: 14, value: (r) => r.qa },
    { header: "ReworkHumidity", key: "rw", width: 8, value: (r) => num(r.rework_humidity), fmt: P1 },
    { header: "Trigger", key: "tr", width: 22, value: (r) => r.trigger },
    { header: "Source", key: "so", width: 22, value: (r) => r.source },
    { header: "ArchivedOn", key: "ar", value: (r) => toDate(r.archived_on), fmt: D },
    { header: "Location_Pallet", key: "lp", width: 24, value: (r) => r.location_pallet },
  ], rows);
  colorResult(ws, 19, 2, rows.length + 1);
  return wb;
}

export async function exportStock(rows: EvaluatedLot[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Stock_Lots");
  addTable<EvaluatedLot>(ws, [
    { header: "BrandCode", key: "b", width: 9, value: (r) => r.brand_code },
    { header: "Customer", key: "c", width: 24, value: (r) => r.customer },
    { header: "BrandName", key: "bn", width: 18, value: (r) => r.brand_name },
    { header: "JO", key: "jo", width: 16, value: (r) => r.jo },
    { header: "BuyerPO", key: "po", width: 16, value: (r) => r.buyer_po },
    { header: "Style", key: "st", width: 24, value: (r) => r.style },
    { header: "Color", key: "co", width: 16, value: (r) => r.colors },
    { header: "Location", key: "lo", width: 14, value: (r) => r.locations },
    { header: "Pallet", key: "pa", width: 20, value: (r) => r.pallets },
    { header: "Cartons", key: "ct", width: 8, value: (r) => r.cartons },
    { header: "Qty", key: "q", width: 8, value: (r) => Number(r.qty) },
    { header: "BPODate", key: "bpo", value: (r) => toDate(r.bpo_date), fmt: D },
    { header: "StockInDate", key: "in", value: (r) => toDate(r.stock_in_date), fmt: D },
    { header: "Stores", key: "sto", width: 20, value: (r) => r.stores },
    { header: "DaysInWH", key: "dw", width: 8, value: (r) => r.days_in_wh },
    { header: "DaysToBPO", key: "db", width: 8, value: (r) => r.days_to_bpo },
    { header: "LastInspDate", key: "li", value: (r) => toDate(r.last_insp_date), fmt: D },
    { header: "SchedInspDate", key: "si", value: (r) => toDate(r.sched_insp_date), fmt: D },
    { header: "IsoMinDays", key: "iso", width: 8, value: (r) => r.iso_min_days },
    { header: "DaysInWHAtInsp", key: "ai", width: 8, value: (r) => r.days_in_wh_at_insp },
    { header: "BPOStatus", key: "bs", width: 10, value: (r) => r.bpo_status },
    { header: "Trigger", key: "tr", width: 18, value: (r) => r.trigger },
    { header: "Priority", key: "pr", width: 9, value: (r) => r.priority },
  ], rows);
  return wb;
}

/** Form_Print – biểu mẫu giấy */
export async function exportForm(rows: PlanView[], s: Settings, formDate: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Form_Print", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "8:8" },
  });
  [11, 10, 15, 12, 12, 10, 11, 12, 12, 16, 9, 10, 10, 10, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const line = (r: number, text: string, size = 11, bold = false) => {
    ws.mergeCells(r, 1, r, 15);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { name: "Times New Roman", size, bold };
    c.alignment = { horizontal: "center" };
  };
  line(1, s.company_name, 13, true);
  line(2, s.company_address, 10);
  line(3, s.company_tel, 10);
  line(5, "HUMIDITY REPORT", 16, true);
  line(6, `Kho: ${s.form_warehouse}          Date (Ngày): ${fmtDate(formDate)}          Chuẩn: ≤ ${s.hum_limit}% = P;  > ${s.hum_limit}% = F;  ${s.readings_per_carton} điểm đo/thùng`, 10);
  const heads = [
    "Date\n(Ngày)", "Buyer\n(Khách hàng)", "JO", "Stock in date\n(Ngày nhập kho)", "Ex-FTY date\n(Ngày xuất hàng)",
    "Total carton q'ty in WH\n(Tổng số thùng)", `Sample ctn\n(${Math.round(s.sample_rate * 100)}% – Số thùng phải kiểm)`,
    "Audit carton no\n(Số thùng kiểm)", "Q'ty in carton\n(Số lượng áo trong thùng)", "Actual humidity\n(Độ ẩm thực tế)\n(%)",
    "Result (P/F)", "QA\n(Kí tên)", "WH (Kho)\n(Kí tên)", "Security\n(Bảo vệ)\n(Kí tên)",
    "Gmt humidity after rework if failed\n(Độ ẩm sau tái chế nếu không đạt) (%)",
  ];
  const border: Partial<ExcelJS.Borders> = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  const h = ws.getRow(8);
  heads.forEach((t, i) => {
    const c = h.getCell(i + 1);
    c.value = t;
    c.font = { name: "Times New Roman", size: 10, bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = border;
  });
  h.height = 62;
  rows.forEach((p, i) => {
    const r = ws.getRow(9 + i);
    const vals: unknown[] = [toDate(p.sched_date), p.brand_code, p.jo, toDate(p.stock_in_date), toDate(p.bpo_date), p.cartons, p.sample_cartons];
    for (let c = 1; c <= 15; c++) {
      const cell = r.getCell(c);
      cell.value = (vals[c - 1] ?? null) as ExcelJS.CellValue;
      cell.font = { name: "Times New Roman", size: 11 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
      if (c === 1 || c === 4 || c === 5) cell.numFmt = "dd/mm/yyyy";
    }
    r.height = 30;
  });
  return wb;
}

/** Báo cáo kỳ (Report) */
export async function exportReport(rows: HistoryRow[], s: Settings, from: string, to: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report", { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const insp = rows.filter((r) => r.result === "PASS" || r.result === "FAIL");
  const pass = insp.filter((r) => r.result === "PASS").length;
  const maxH = rows.reduce((m, r) => Math.max(m, Number(r.max_humidity ?? 0)), 0);
  ws.mergeCells(1, 1, 1, 17);
  ws.getCell(1, 1).value = "TESSELLATION HÒA BÌNH (THV) – HUMIDITY INSPECTION REPORT";
  ws.getCell(1, 1).font = { size: 14, bold: true, color: { argb: "FF0E6F8A" } };
  ws.mergeCells(2, 1, 2, 17);
  ws.getCell(2, 1).value = `Period: ${fmtDate(from, "dmmy")} → ${fmtDate(to, "dmmy")}  |  Humidity ≤ ${s.hum_limit}% = PASS  |  Sampling: ROUNDUP(Cartons×${Math.round(s.sample_rate * 100)}%,0) thùng × ${s.readings_per_carton} điểm đo`;
  const kpi: [string, number | string][] = [
    ["Lots inspected", insp.length], ["PASS", pass], ["FAIL", insp.length - pass],
    ["Pass rate", insp.length ? pass / insp.length : 0], ["Under-sampled lots", rows.filter((r) => r.sampling_check === "UNDER").length], ["Max humidity", maxH],
  ];
  kpi.forEach(([k, v], i) => {
    ws.getCell(4 + i, 1).value = k;
    ws.getCell(4 + i, 1).font = { bold: true };
    ws.getCell(4 + i, 2).value = v;
    if (k === "Pass rate") ws.getCell(4 + i, 2).numFmt = "0.0%";
    if (k === "Max humidity") ws.getCell(4 + i, 2).numFmt = P1;
  });
  addTable<HistoryRow>(ws, [
    { header: "Date", key: "d", width: 10, value: (r) => toDate(r.inspection_date), fmt: "dd/mm/yy" },
    { header: "Buyer", key: "b", width: 9, value: (r) => r.brand_code },
    { header: "JO", key: "jo", width: 15, value: (r) => r.jo },
    { header: "Color", key: "c", width: 12, value: (r) => r.color },
    { header: "BPO", key: "po", width: 14, value: (r) => r.bpo },
    { header: "Stock in date", key: "in", width: 10, value: (r) => toDate(r.stock_in_date), fmt: "dd/mm/yy" },
    { header: "Ex-FTY date", key: "ex", width: 10, value: (r) => toDate(r.exfty_date), fmt: "dd/mm/yy" },
    { header: "Total carton", key: "t", width: 8, value: (r) => r.total_cartons },
    { header: "Sample req.", key: "sr", width: 8, value: (r) => r.sample_required },
    { header: "Audit carton no", key: "a", width: 12, value: (r) => r.audit_carton_no },
    { header: "Q'ty in carton", key: "q", width: 10, value: (r) => r.qty_in_carton },
    { header: "Actual humidity (%)", key: "rd", width: 24, value: (r) => r.readings },
    { header: "Max %", key: "mx", width: 7, value: (r) => num(r.max_humidity), fmt: P1 },
    { header: "Result (P/F)", key: "re", width: 8, value: (r) => (r.result === "PASS" ? "P" : r.result === "FAIL" ? "F" : r.result) },
    { header: "Sampling", key: "sk", width: 8, value: (r) => r.sampling_check },
    { header: "QA", key: "qa", width: 12, value: (r) => r.qa },
    { header: "Rework %", key: "rw", width: 8, value: (r) => num(r.rework_humidity), fmt: P1 },
  ], rows, 11);
  colorResult(ws, 14, 12, rows.length + 11);
  const sig = rows.length + 14;
  ws.getCell(sig, 1).value = "Prepared by (QA)";
  ws.getCell(sig, 7).value = "Checked by (QA Manager)";
  ws.getCell(sig, 13).value = "Approved by (Factory Manager)";
  [1, 7, 13].forEach((c) => (ws.getCell(sig, c).font = { bold: true }));
  ws.pageSetup.printTitlesRow = "11:11";
  return wb;
}

export async function exportCapa(rows: Capa[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CAPA");
  addTable<Capa>(ws, [
    { header: "CAPA No", key: "no", width: 15, value: (r) => r.capa_no },
    { header: "Status", key: "st", width: 12, value: (r) => r.status },
    { header: "PlanID", key: "p", width: 15, value: (r) => r.history_plan_id ?? r.plan_id },
    { header: "Brand", key: "b", width: 9, value: (r) => r.brand_code },
    { header: "JO", key: "jo", width: 15, value: (r) => r.jo },
    { header: "Buyer PO", key: "po", width: 15, value: (r) => r.buyer_po },
    { header: "Ngày kiểm", key: "d", value: (r) => toDate(r.inspection_date), fmt: D },
    { header: "Max %", key: "mx", width: 7, value: (r) => num(r.max_humidity), fmt: P1 },
    { header: "Thùng FAIL", key: "fc", width: 7, value: (r) => r.failed_cartons },
    { header: "Vấn đề", key: "pb", width: 40, value: (r) => r.problem },
    { header: "Nguyên nhân gốc", key: "rc", width: 36, value: (r) => r.root_cause },
    { header: "Khắc phục tức thời (tái chế)", key: "ct", width: 30, value: (r) => r.containment },
    { header: "Hành động khắc phục", key: "ca", width: 30, value: (r) => r.corrective_action },
    { header: "Phòng ngừa", key: "pa", width: 30, value: (r) => r.preventive_action },
    { header: "Phụ trách", key: "ow", width: 14, value: (r) => r.owner },
    { header: "Hạn", key: "due", value: (r) => toDate(r.due_date), fmt: D },
    { header: "Độ ẩm sau tái chế", key: "rw", width: 8, value: (r) => num(r.rework_humidity), fmt: P1 },
    { header: "Xác nhận hiệu quả", key: "vf", width: 30, value: (r) => r.verification },
    { header: "Đóng ngày", key: "cl", value: (r) => (r.closed_at ? toDate(r.closed_at.slice(0, 10)) : null), fmt: D },
  ], rows);
  for (let r = 2; r <= rows.length + 1; r++) ws.getRow(r).alignment = { vertical: "top", wrapText: true };
  return wb;
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
