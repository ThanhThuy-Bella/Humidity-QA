/**
 * Sinh supabase/seed.sql từ dữ liệu của file .xlsm (đã xuất ra fixture.json + báo cáo kho đang dùng).
 *   npx tsx scripts/make-seed.ts <bao-cao.xlsx> <fixture.json> <names.json> > supabase/seed.sql
 * Chuyển: Settings, tblStores, tblBrandMap, tblHistory, tồn kho theo lô (chạy lại engine từ báo cáo kho
 * để có location_pallets), kế hoạch đang mở (tblPlan) + thùng mẫu (tblResult) kèm số đo nếu có.
 */
import { readFileSync } from "node:fs";
import { parseWarehouseReport } from "../src/lib/engine/parseWarehouse";
import { buildStockLots } from "../src/lib/engine/rules";
import { lotKey, numVal } from "../src/lib/format";
import type { StockLot } from "../src/lib/types";

const [file, fx, namesFile] = process.argv.slice(2);
const F = JSON.parse(readFileSync(fx, "utf8"));
const N = JSON.parse(readFileSync(namesFile, "utf8"));

const q = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
};
const d = (v: unknown) => (v ? q(String(v).slice(0, 10)) : "null");
const n = (v: unknown) => { const x = numVal(v); return x === null ? "null" : String(x); };
const i = (v: unknown) => { const x = numVal(v); return x === null ? "null" : String(Math.round(x)); };
const out: string[] = [];
const emit = (s: string) => out.push(s);
const values = (table: string, cols: string[], rows: string[][], conflict = "on conflict do nothing") => {
  for (let k = 0; k < rows.length; k += 200) {
    emit(`insert into public.${table} (${cols.join(", ")}) values\n` + rows.slice(k, k + 200).map((r) => `  (${r.join(", ")})`).join(",\n") + `\n${conflict};`);
  }
};

(async () => {
  const rep = await parseWarehouseReport(readFileSync(file), "FGs_Report");
  const inc = new Set<string>(F.stores.filter((r: string[]) => r[1] === "Y").map((r: string[]) => r[0]));
  const bmap = new Map<string, string>(F.brands.filter((r: string[]) => r[0]).map((r: string[]) => [r[0], r[1]]));
  const built = buildStockLots({ cartons: rep.cartons, includedStores: inc, brandMap: bmap, gradeFilter: String(N.GradeFilter ?? "A") });
  const lotBy = new Map<string, StockLot>(built.lots.map((l) => [lotKey(l.jo, l.buyer_po), l]));

  emit(`-- =====================================================================
-- SEED – chuyển dữ liệu từ Humidity_Inspection_System_FINAL_v4.xlsm
-- Sinh tự động bởi scripts/make-seed.ts. Chạy SAU 0001_schema.sql, 1 lần, trong Supabase > SQL Editor.
-- Gồm: Settings, ${F.stores.filter((r: unknown[]) => r[0]).length} store, ${F.brands.filter((r: unknown[]) => r[0]).length} brand map, ${F.hist.length} dòng Lịch sử,
--      ${built.lots.length} lô tồn (báo cáo ${N.LastImportedFile}), ${F.plan.length} lô kế hoạch đang mở + ${F.res.length} thùng mẫu.
-- Chạy lại an toàn: dòng đã có sẽ được bỏ qua (riêng tồn kho theo lô được ghi đè).
-- =====================================================================
begin;
`);

  // ---- Settings (PlanDate để trống = hôm nay; file Excel đang cố định 19/10 chỉ để test)
  emit(`update public.settings set
  hum_limit = ${n(N.HumLimit)}, sample_rate = ${n(N.SampleRate)}, readings_per_carton = ${i(N.ReadingsPerCarton)},
  rain_start = ${i(N.RainStart)}, rain_end = ${i(N.RainEnd)}, iso_weeks_rain = ${i(N.IsoWeeksRain)}, iso_weeks_dry = ${i(N.IsoWeeksDry)},
  preship_earliest = ${i(N.PreShipEarliest)}, preship_deadline = ${i(N.PreShipDeadline)}, plan_lookahead = ${i(N.PlanLookAhead)},
  plan_date_override = null, grade_filter = ${q(N.GradeFilter ?? "")}, warehouse_sheet = ${q(N.WarehouseSheet)},
  mail_subject = ${q(N.MailSubject)}, form_warehouse = ${q(N.FormKho)},
  last_imported_file = ${q(N.LastImportedFile)}, last_import_time = ${q(String(N.LastImportTime).replace("T", " ") + "+07")},
  updated_at = now()
where id = 1;
`);

  values("stores", ["store_name", "include", "rows_in_report", "note"],
    F.stores.filter((r: unknown[]) => r[0]).map((r: unknown[]) => [q(r[0]), r[1] === "Y" ? "true" : "false", i(r[2] ?? 0), "null"]),
    "on conflict (store_name) do update set include = excluded.include, rows_in_report = excluded.rows_in_report");
  values("brand_map", ["brand_name", "brand_code", "note", "auto_added"],
    F.brands.filter((r: unknown[]) => r[0]).map((r: unknown[]) => [q(r[0]), q(r[1]), q(r[2]), String(String(r[2] ?? "").startsWith("AUTO-ADDED"))]),
    "on conflict (brand_name) do update set brand_code = excluded.brand_code, note = excluded.note");

  // ---- Lịch sử (tblHistory – 25 cột)
  values("inspection_history",
    ["plan_id", "inspection_date", "brand_code", "jo", "color", "bpo", "stock_in_date", "exfty_date", "total_cartons", "audit_carton_no",
      "qty_in_carton", "readings", "reading_count", "cartons_tested", "sample_required", "sampling_check", "max_humidity", "avg_humidity",
      "result", "qa", "rework_humidity", "trigger", "source", "archived_on", "location_pallet"],
    F.hist.filter((h: unknown[]) => h[0] && h[1]).map((h: unknown[]) => [
      q(h[0]), d(h[1]), q(h[2]), q(h[3]), q(h[4]), q(h[5]), d(h[6]), d(h[7]), i(h[8]), q(h[9]), q(h[10]), q(h[11]), i(h[12]), i(h[13]),
      i(h[14]), q(h[15]), n(h[16]), n(h[17]), q(h[18] ?? "NO DATA"), q(h[19]), n(h[20]), q(h[21]), q(h[22]), d(h[23]), q(h[24]),
    ]));

  // ---- Tồn kho theo lô (snapshot báo cáo kho đang dùng)
  emit(`insert into public.warehouse_imports (file_name, report_date, source, carton_rows, included_rows, lot_count, stats, imported_at)
values (${q(N.LastImportedFile)}, ${d(String(N.LastImportedFile).match(/\d{4}-\d{2}-\d{2}/)?.[0])}, 'seed', ${rep.cartons.length}, ${built.includedCartons}, ${built.lots.length},
  '{"note":"Chuyển từ file Excel v4"}', ${q(String(N.LastImportTime).replace("T", " ") + "+07")});
delete from public.stock_lots;`);
  values("stock_lots",
    ["import_id", "brand_code", "customer", "brand_name", "jo", "buyer_po", "style", "colors", "locations", "pallets", "location_pallets",
      "cartons", "qty", "bpo_date", "stock_in_date", "stores"],
    built.lots.map((l) => [
      "(select max(id) from public.warehouse_imports where source = 'seed')", q(l.brand_code), q(l.customer), q(l.brand_name), q(l.jo), q(l.buyer_po),
      q(l.style), q(l.colors), q(l.locations), q(l.pallets), `${q(JSON.stringify(l.location_pallets))}::jsonb`, String(l.cartons), String(l.qty),
      d(l.bpo_date), d(l.stock_in_date), q(l.stores),
    ]), "");

  // ---- Kế hoạch đang mở (tblPlan) + thông tin cấp lô lấy từ tblResult
  const resBy = new Map<string, unknown[][]>();
  for (const r of F.res as unknown[][]) {
    const k = String(r[0]);
    if (!resBy.has(k)) resBy.set(k, []);
    resBy.get(k)!.push(r);
  }
  values("inspection_plan",
    ["plan_id", "brand_code", "customer", "jo", "buyer_po", "style", "color", "locations", "pallets", "location_pallets", "cartons", "qty",
      "bpo_date", "stock_in_date", "sched_date", "trigger", "sample_cartons", "status", "qa_name", "rework_humidity", "remark"],
    (F.plan as unknown[][]).map((p) => {
      const lot = lotBy.get(lotKey(p[1], p[2]));
      const rs = resBy.get(String(p[9])) ?? [];
      const first = (c: number) => rs.find((r) => r[c] !== null && r[c] !== "")?.[c] ?? null;
      return [
        q(p[9]), q(p[0]), q(p[10]), q(p[1]), q(p[2] ?? ""), q(p[11]), q(p[12]), q(lot?.locations ?? p[13]), q(lot?.pallets ?? p[14]),
        `${q(JSON.stringify(lot?.location_pallets ?? {}))}::jsonb`, i(p[3]), n(p[4]), d(p[5]), d(p[6]), d(p[7]), q(p[15]), i(p[18]), "'OPEN'",
        q(first(15)), n(first(16)), q(first(17)),
      ];
    }));
  values("inspection_readings",
    ["plan_id", "sample_no", "inspection_date", "location", "pallet", "audit_carton_no", "qty_in_carton", "r1", "r2", "r3"],
    (F.res as unknown[][]).map((r) => {
      const has = [r[9], r[10], r[11]].some((x) => numVal(x) !== null);
      return [q(r[0]), i(r[6]), has ? d(r[1]) : "null", q(r[18]), q(r[19]), q(r[7]), q(r[8]), n(r[9]), n(r[10]), n(r[11])];
    }), "on conflict (plan_id, sample_no) do nothing");

  emit(`insert into public.activity_log (action, detail) values ('SEED', '{"source":"Humidity_Inspection_System_FINAL_v4.xlsm"}');
commit;

-- Kiểm tra nhanh sau khi chạy:
-- select (select count(*) from stores) stores, (select count(*) from brand_map) brands, (select count(*) from inspection_history) history,
--        (select count(*) from stock_lots) lots, (select count(*) from inspection_plan where status='OPEN') open_plans,
--        (select count(*) from inspection_readings) sample_rows;
`);
  process.stdout.write(out.join("\n"));
  console.error(`seed: stores ${F.stores.filter((r: unknown[]) => r[0]).length}, brands ${F.brands.filter((r: unknown[]) => r[0]).length}, history ${F.hist.length}, lots ${built.lots.length}, plans ${F.plan.length}, readings ${F.res.length}; missing lot match: ${(F.plan as unknown[][]).filter((p) => !lotBy.has(lotKey(p[1], p[2]))).length}`);
})();
