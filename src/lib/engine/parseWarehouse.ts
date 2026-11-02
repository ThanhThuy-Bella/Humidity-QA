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

export async function parseWarehouseReport(buffer: Buffer, preferredSheet = "FGs_Report"): Promise<ParsedReport> {
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
