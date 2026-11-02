/**
 * Kiểm chứng engine TypeScript với dữ liệu thật của file VBA.
 *   npx tsx scripts/test-engine.ts <bao-cao.xlsx> <fixture.json> <planDate>
 * fixture.json = dữ liệu xuất từ file .xlsm (tblStores, tblBrandMap, tblHistory, tblLots, tblPlan, tblResult)
 */
import { readFileSync } from "node:fs";
import { parseWarehouseReport } from "../src/lib/engine/parseWarehouse";
import { buildStockLots, evaluateLots, sampleCartons } from "../src/lib/engine/rules";
import { lotKey } from "../src/lib/format";
import type { Settings } from "../src/lib/types";

const [file, fx, planDate = "2026-10-19"] = process.argv.slice(2);
const F = JSON.parse(readFileSync(fx, "utf8"));
const s = {
  hum_limit: 6.5, sample_rate: 0.02, readings_per_carton: 3, rain_start: 5, rain_end: 10, iso_weeks_rain: 4, iso_weeks_dry: 6,
  preship_earliest: 7, preship_deadline: 5, plan_lookahead: 14, grade_filter: "A",
} as Settings;

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  – " + detail : ""}`); if (!ok) failed++; };

(async () => {
  const t0 = Date.now();
  const rep = await parseWarehouseReport(readFileSync(file), "FGs_Report");
  console.log(`parse: ${Date.now() - t0} ms · sheet ${rep.sheetName} · ${rep.cartons.length} UCC`);

  const inc = new Set<string>(F.stores.filter((r: string[]) => r[1] === "Y").map((r: string[]) => r[0]));
  const bmap = new Map<string, string>(F.brands.filter((r: string[]) => r[0]).map((r: string[]) => [r[0], r[1]]));
  const built = buildStockLots({ cartons: rep.cartons, includedStores: inc, brandMap: bmap, gradeFilter: "A" });
  console.log(`sau lọc: ${built.includedCartons} UCC · ${built.lots.length} lô · brand mới: ${[...built.newBrands.keys()].join(", ") || "—"}`);

  const last = new Map<string, string>();
  for (const h of F.hist) if (h[18] !== "NO DATA") { const k = lotKey(h[3], h[5] ?? ""); if (!last.has(k) || h[1] > last.get(k)!) last.set(k, h[1]); }
  const ev = evaluateLots(built.lots, last, s, planDate);

  const xl = new Map<string, unknown[]>(F.lots.map((r: unknown[]) => [`${r[0]}|${lotKey(r[3], r[4])}`, r]));
  let same = 0;
  const diffs: string[] = [];
  const fields: [string, number, (l: (typeof ev)[number]) => unknown][] = [
    ["cartons", 9, (l) => l.cartons], ["qty", 10, (l) => l.qty], ["bpo", 11, (l) => l.bpo_date], ["stockIn", 12, (l) => l.stock_in_date],
    ["sched", 17, (l) => l.sched_insp_date], ["bpoStatus", 20, (l) => l.bpo_status], ["trigger", 21, (l) => l.trigger || null],
  ];
  for (const l of ev) {
    const r = xl.get(`${l.brand_code}|${lotKey(l.jo, l.buyer_po)}`);
    if (!r) { diffs.push(`không có trong Excel: ${l.brand_code} ${l.jo} ${l.buyer_po}`); continue; }
    let ok = true;
    for (const [n, i, f] of fields) if (String(f(l) ?? "") !== String(r[i] ?? "")) { ok = false; diffs.push(`${n} ${l.jo}/${l.buyer_po}: ts=${f(l)} xl=${r[i]}`); }
    if (ok) same++;
  }
  check("Stock_Lots khớp Excel (7 cột)", same === ev.length && ev.length === xl.size, `${same}/${ev.length} (Excel ${xl.size})`);
  diffs.slice(0, 10).forEach((d) => console.log("   ", d));

  const trig = ev.filter((l) => l.trigger);
  const tsKeys = new Set(trig.map((l) => lotKey(l.jo, l.buyer_po)));
  const xlPlan: unknown[][] = F.plan;
  const inTs = xlPlan.filter((p) => tsKeys.has(lotKey(p[1], p[2]))).length;
  check("Humidity_Plan: lô Excel đều có Trigger trong TS", inTs === xlPlan.length, `${inTs}/${xlPlan.length}`);
  check("Số lô có Trigger = số lô trong Plan", trig.length === xlPlan.length, `TS ${trig.length} · Excel ${xlPlan.length}`);
  const smpTs = xlPlan.reduce((a, p) => a + sampleCartons(Number(p[3]), s), 0);
  const smpXl = xlPlan.reduce((a, p) => a + Number(p[18]), 0);
  check("Thùng mẫu ROUNDUP(×2%) = Excel", smpTs === smpXl && smpXl === F.res.length, `TS ${smpTs} · Plan ${smpXl} · Result ${F.res.length}`);
  console.log(`\nTrigger: PRE ${trig.filter((l) => l.trigger === "PRE-SHIPMENT").length} · RE ${trig.filter((l) => l.trigger.startsWith("RE")).length} · OVERDUE ${ev.filter((l) => l.bpo_status === "OVERDUE").length}`);
  console.log(failed ? `\n${failed} kiểm tra FAIL` : "\nTất cả kiểm tra PASS");
  process.exit(failed ? 1 : 0);
})();
