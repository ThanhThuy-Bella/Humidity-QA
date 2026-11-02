// Port các hàm VBA NumVal, TextOf, JoinKeys, LotKey, NormH

/** "4,5" → 4.5 ; trả null nếu trống / không phải số */
export function numVal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(",", ".");
  if (!s || /[^0-9.]/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function textOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v));
  return String(v).trim();
}

/** Danh sách khóa đã sắp xếp, tối đa `cap` phần tử rồi thêm " …" */
export function joinKeys(set: Iterable<string>, cap = 8): string {
  const a = Array.from(set).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (a.length > cap) return a.slice(0, cap).join(", ") + " …";
  return a.join(", ");
}

export function lotKey(jo: unknown, po: unknown): string {
  return `${String(jo ?? "").trim().toUpperCase()}|${String(po ?? "").trim().toUpperCase()}`;
}

export function normHeader(s: unknown): string {
  return String(s ?? "").trim().replace(/[\s_]/g, "").toUpperCase();
}

/** Định dạng số đo kiểu Excel "0.0#": 4 → 4.0 ; 4.5 → 4.5 ; 4.25 → 4.25 */
export function fmtReading(x: number): string {
  const r = Math.round(x * 100) / 100;
  const s = r.toFixed(2);
  return s.endsWith("0") ? r.toFixed(1) : s;
}

/** ROUNDUP(x,0) chống sai số dấu phẩy động (135 × 0.02 = 2.7 → 3) */
export function roundUp(x: number): number {
  return Math.ceil(Math.round(x * 1e9) / 1e9);
}

export function pct(x: number | null | undefined, d = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "";
  return `${Number(x).toFixed(d)}%`;
}

export function n0(x: number | null | undefined): string {
  if (x === null || x === undefined) return "";
  return Number(x).toLocaleString("en-US");
}
