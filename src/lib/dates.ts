// Ngày lưu dạng chuỗi ISO 'yyyy-mm-dd' (không múi giờ) – tránh lệch ngày giữa server UTC và VN.

const DAY = 86_400_000;

export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** 0 = Chủ nhật … 6 = Thứ 7 (theo ngày VN) */
export function weekdayVN(iso: string = todayVN()): number {
  return new Date(toUTC(iso)).getUTCDay();
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * DAY);
}

/** a − b (số ngày) */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY);
}

export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

export function isoFromParts(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return fromUTC(Date.UTC(y, m - 1, d));
}

/** Excel serial → ISO */
export function serialToIso(serial: number): string {
  return fromUTC(Date.UTC(1899, 11, 30) + Math.floor(serial) * DAY);
}

/** Port hàm VBA ToDate: Date thật, serial Excel, "yyyy-mm-dd", "dd/mm/yyyy". Trả null nếu không phải ngày. */
export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") return v > 20000 && v < 80000 ? serialToIso(v) : null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 20000 && n < 80000 ? serialToIso(n) : null;
  }
  if (s.length >= 10 && s[4] === "-") return isoFromParts(Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10)));
  if (s.includes("/")) {
    const p = s.split("/");
    if (p.length === 3) return isoFromParts(Number(p[2].slice(0, 4)), Number(p[1]), Number(p[0]));
  }
  return null;
}

/** Port DateFromName: tìm yyyy-mm-dd hoặc yyyymmdd trong tên file / tiêu đề mail */
export function dateFromName(name: string): string | null {
  const a = name.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (a) return isoFromParts(Number(a[1]), Number(a[2]), Number(a[3]));
  const b = name.match(/(20\d{2})(\d{2})(\d{2})/);
  if (b) return isoFromParts(Number(b[1]), Number(b[2]), Number(b[3]));
  return null;
}

export function fmtDate(iso: string | null | undefined, style: "dmy" | "dm" | "dmmy" = "dmy"): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (style === "dm") return `${d}/${m}`;
  if (style === "dmmy") {
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1];
    return `${d}-${mon}-${y}`;
  }
  return `${d}/${m}/${y}`;
}

export function yymmdd(iso: string): string {
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}
