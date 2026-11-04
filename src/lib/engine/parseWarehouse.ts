import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Readable } from "node:stream";
import type { WarehouseCarton } from "../types";
import { normHeader, textOf } from "../format";
import { toIsoDate } from "../dates";

/**
 * Port ImportWarehouseReport (VBA mục 1).
 * Đọc bao-cao_*.xlsx, sheet FGs_Report (1 dòng = 1 thùng / UCC).
 * Tìm dòng tiêu đề trong 5 dòng đầu theo tên cột; bắt buộc có "Ref no" và "Ucc".
 * Streaming reader → đọc được file 50–60k dòng trong serverless.
 */
const TARGETS = [
  "STORECD", "CUSTOMER", "LOCATION", "PALLET", "REFNO", "STYLENO", "BUYERPO", "UCC", "COLOR",
  "QTY", "BUYERPODATE", "INWAREHOUSEDATE", "BRANDNAME", "STYLEDESC", "GRADE", "AGING", "STORENAME",
] as const;

type Field = keyof WarehouseCarton;
const FIELDS: Field[] = [
  "storeCd", "customer", "location", "pallet", "refNo", "styleNo", "buyerPo", "ucc", "color",
  "qty", "buyerPoDate", "inWarehouseDate", "brandName", "styleDesc", "grade", "aging", "storeName",
];
const REF = 4;
const UCC = 7;

/** exceljs trả rich text / formula / hyperlink dạng object → lấy giá trị thật */
function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return cellValue(o.text);
    if ("error" in o) return null;
  }
  return v;
}

function rowArray(values: unknown): unknown[] {
  const a = Array.isArray(values) ? values : [];
  return a.map(cellValue);
}

function detectHeader(row: unknown[]): number[] | null {
  const map: number[] = new Array(17).fill(0);
  row.forEach((v, c) => {
    const i = TARGETS.indexOf(normHeader(v) as (typeof TARGETS)[number]);
    if (i >= 0 && map[i] === 0) map[i] = c;
  });
  return map[REF] > 0 && map[UCC] > 0 ? map : null;
}

function toCarton(row: unknown[], map: number[]): WarehouseCarton | null {
  const get = (i: number) => (map[i] > 0 ? row[map[i]] : null);
  const ref = textOf(get(REF));
  if (!ref) return null;
  const c = {} as Record<Field, unknown>;
  FIELDS.forEach((f, i) => (c[f] = get(i)));
  return {
    storeCd: textOf(c.storeCd), customer: textOf(c.customer), location: textOf(c.location), pallet: textOf(c.pallet),
    refNo: ref, styleNo: textOf(c.styleNo), buyerPo: textOf(c.buyerPo), ucc: textOf(c.ucc), color: textOf(c.color),
    qty: Number(String(c.qty ?? "0").replace(",", ".")) || 0,
    buyerPoDate: toIsoDate(c.buyerPoDate), inWarehouseDate: toIsoDate(c.inWarehouseDate),
    brandName: textOf(c.brandName), styleDesc: textOf(c.styleDesc), grade: textOf(c.grade),
    aging: textOf(c.aging), storeName: textOf(c.storeName),
  };
}

export interface ParsedReport {
  sheetName: string;
  cartons: WarehouseCarton[];
}

/** Tên sheet theo số thứ tự sheetN.xml (streaming reader chỉ biết tên khi workbook.xml nằm trước sheet trong zip) */
async function sheetNames(buffer: Buffer): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  try {
    const zip = await JSZip.loadAsync(buffer);
    const wb = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
    const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
    const relTarget = new Map<string, string>();
    for (const r of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = r[0].match(/Id="([^"]+)"/)?.[1];
      const t = r[0].match(/Target="([^"]+)"/)?.[1];
      if (id && t) relTarget.set(id, t);
    }
    for (const sh of wb.matchAll(/<sheet\b[^>]*>/g)) {
      const name = sh[0].match(/name="([^"]+)"/)?.[1];
      const rid = sh[0].match(/r:id="([^"]+)"/)?.[1];
      const n = rid ? relTarget.get(rid)?.match(/sheet(\d+)\.xml$/)?.[1] : undefined;
      if (name && n) m.set(Number(n), name.replace(/&amp;/g, "&"));
    }
  } catch {
    /* không đọc được → dùng tên mặc định */
  }
  return m;
}

/**
 * v1.5.1: đọc streaming trước (nhẹ RAM); nếu exceljs streaming lỗi với file do phần mềm kho xuất ra
 * (vd. "Cannot read properties of undefined (reading 'length')" khi thứ tự file trong zip khác thường)
 * thì đọc lại bằng chế độ nạp toàn bộ workbook.
 */
export async function parseWarehouseReport(buffer: Buffer, preferredSheet = "FGs_Report"): Promise<ParsedReport> {
  // v1.5.1: bộ đọc XML riêng là chính – chịu được file báo cáo kho xuất từ hệ thống WMS
  // (ô không có toạ độ r="A1", sharedStrings nằm sau các sheet) mà exceljs đọc lỗi.
  try {
    return await parseRaw(buffer, preferredSheet);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Không tìm thấy dòng tiêu đề")) throw e;
    console.error("[parseWarehouse] bộ đọc XML lỗi, thử exceljs:", msg);
  }
  try {
    return await parseStreaming(buffer, preferredSheet);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Không tìm thấy dòng tiêu đề")) throw e;
    console.error("[parseWarehouse] streaming lỗi, chuyển sang đọc toàn bộ:", msg);
    try {
      return await parseFull(buffer, preferredSheet);
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`Không đọc được file Excel (${m2}). Thử mở file bằng Excel, Save As .xlsx rồi nạp lại.`);
    }
  }
}

async function parseFull(buffer: Buffer, preferredSheet: string): Promise<ParsedReport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const found: ParsedReport[] = [];
  for (const ws of wb.worksheets) {
    let map: number[] | null = null;
    const cartons: WarehouseCarton[] = [];
    const last = ws.actualRowCount ? ws.rowCount : 0;
    for (let r = 1; r <= last; r++) {
      const vals = rowArray(ws.getRow(r).values);
      if (!map) {
        if (r <= 5) map = detectHeader(vals);
        if (!map && r >= 5) break;
        continue;
      }
      const c = toCarton(vals, map);
      if (c) cartons.push(c);
    }
    if (map) {
      const rep = { sheetName: ws.name, cartons };
      if (ws.name.toLowerCase() === preferredSheet.toLowerCase()) return rep;
      found.push(rep);
    }
  }
  if (found.length) return found[0];
  throw new Error(`Không tìm thấy dòng tiêu đề (cần cột 'Ref no' và 'Ucc') trong 5 dòng đầu của sheet ${preferredSheet}.`);
}

async function parseStreaming(buffer: Buffer, preferredSheet: string): Promise<ParsedReport> {
  const names = await sheetNames(buffer);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", worksheets: "emit", entries: "emit",
  });

  const found: ParsedReport[] = [];
  for await (const ws of reader) {
    const w = ws as unknown as { name?: string; id?: number | string };
    let name = w.name ?? "";
    if ((!name || /^Sheet\d+$/.test(name)) && names.has(Number(w.id))) name = names.get(Number(w.id))!;
    let map: number[] | null = null;
    let rowNo = 0;
    const cartons: WarehouseCarton[] = [];
    for await (const row of ws) {
      rowNo++;
      const vals = rowArray(row.values);
      if (!map) {
        if (rowNo <= 5) map = detectHeader(vals);
        // rowNo > 5 mà chưa thấy tiêu đề → không phải sheet thành phẩm, đọc lướt cho hết stream
        continue;
      }
      const c = toCarton(vals, map);
      if (c) cartons.push(c);
    }
    if (map) {
      const rep = { sheetName: name, cartons };
      if (name.toLowerCase() === preferredSheet.toLowerCase()) return rep;
      found.push(rep);
    }
  }
  if (found.length) return found[0];
  throw new Error(`Không tìm thấy dòng tiêu đề (cần cột 'Ref no' và 'Ucc') trong 5 dòng đầu của sheet ${preferredSheet}.`);
}

// ============================================================= bộ đọc XML riêng (v1.5.1)
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unxml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]);
}
/** nối mọi <t>…</t> trong một <si> hoặc <is> (rich text nhiều đoạn) */
function textRuns(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? unxml(m[1]) : "";
  return out;
}
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n;
}
const attr = (s: string, name: string) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

async function parseRaw(buffer: Buffer, preferredSheet: string): Promise<ParsedReport> {
  const zip = await JSZip.loadAsync(buffer);
  const wb = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const relTarget = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(r[0], "Id");
    const tg = attr(r[0], "Target");
    if (id && tg) relTarget.set(id, tg.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const sheets: { name: string; path: string }[] = [];
  for (const sh of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unxml(attr(sh[0], "name") ?? "");
    const rid = attr(sh[0], "r:id");
    const tg = rid ? relTarget.get(rid) : undefined;
    if (name && tg) sheets.push({ name, path: "xl/" + tg });
  }
  if (!sheets.length) throw new Error("workbook.xml không có sheet");
  // sheet ưu tiên lên đầu
  sheets.sort((a, b) => Number(b.name.toLowerCase() === preferredSheet.toLowerCase()) - Number(a.name.toLowerCase() === preferredSheet.toLowerCase()));

  let shared: string[] | null = null;
  const loadShared = async () => {
    if (shared) return shared;
    const sx = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
    shared = Array.from(sx.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g), (m) => (m[1] ? textRuns(m[1]) : ""));
    return shared;
  };

  for (const sh of sheets) {
    const xml = await zip.file(sh.path)?.async("string");
    if (!xml) continue;
    const ss = await loadShared();
    let map: number[] | null = null;
    let rowNo = 0;
    const cartons: WarehouseCarton[] = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      rowNo++;
      const vals: unknown[] = [];
      let next = 1;
      for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = cm[1];
        const ref = attr(a, "r");
        const col = ref ? colIndex(ref) : next;
        next = col + 1;
        const body = cm[2] ?? "";
        const tp = attr(a, "t");
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: unknown = null;
        if (tp === "s") val = v !== undefined ? ss[Number(v)] ?? "" : null;
        else if (tp === "inlineStr") val = textRuns(body);
        else if (tp === "str" || tp === "e" || tp === "d") val = v !== undefined ? unxml(v) : null;
        else if (tp === "b") val = v === "1";
        else if (v !== undefined) { const n = Number(v); val = Number.isFinite(n) ? n : unxml(v); }
        vals[col] = val;
      }
      if (!map) {
        if (rowNo <= 5) map = detectHeader(vals);
        if (!map && rowNo >= 5) break;
        continue;
      }
      const c = toCarton(vals, map);
      if (c) cartons.push(c);
    }
    if (map) return { sheetName: sh.name, cartons };
  }
  throw new Error(`Không tìm thấy dòng tiêu đề (cần cột 'Ref no' và 'Ucc') trong 5 dòng đầu của sheet ${preferredSheet}.`);
}
