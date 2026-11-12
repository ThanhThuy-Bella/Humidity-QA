import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyProcessResult, PlanView, ReadingRow, Settings, StockLot } from "../types";
import { fetchAll, insertChunked } from "../supabase/admin";
import { allocateColors, buildStockLots, colorSequence, evaluateLots, lastInspDay, placeWithCapacity, planIdPrefix, sampleCartons } from "./rules";
import { parseWarehouseReport } from "./parseWarehouse";
import { dateFromName, fmtDate, todayVN } from "../dates";
import { fmtReading, lotKey } from "../format";
import { planDateOf } from "../settings";

type DB = SupabaseClient;

// ===================================================================== Helpers đọc dữ liệu
export async function loadLastInspMap(db: DB): Promise<Map<string, string>> {
  const rows = await fetchAll<{ jo: string; bpo: string | null; inspection_date: string }>((a, b) =>
    db.from("inspection_history").select("jo,bpo,inspection_date").neq("result", "NO DATA").range(a, b),
  );
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = lotKey(r.jo, r.bpo ?? "");
    const cur = m.get(k);
    if (!cur || r.inspection_date > cur) m.set(k, r.inspection_date);
  }
  return m;
}

export async function loadStockLots(db: DB): Promise<StockLot[]> {
  const rows = await fetchAll<StockLot>((a, b) => db.from("stock_lots").select("*").order("id").range(a, b));
  return rows.map((r) => ({ ...r, qty: Number(r.qty) }));
}

export async function loadOpenPlans(db: DB): Promise<PlanView[]> {
  return fetchAll<PlanView>((a, b) => db.from("v_plan").select("*").eq("status", "OPEN").range(a, b));
}

async function log(db: DB, action: string, detail: object, userId?: string | null) {
  await db.from("activity_log").insert({ action, detail, user_id: userId ?? null });
}

// =====================================================================
// 3. GENERATE HUMIDITY PLAN (port GenerateHumidityPlan + GenerateSampleRows)
//   B1: đồng bộ lô PENDING đang mở với tồn kho: hết hàng / hết Trigger → hủy ; BPO đổi → dời lịch
//   B2: tạo kế hoạch mới cho lô có Trigger chưa có kế hoạch mở
//   B3: tạo dòng thùng mẫu ROUNDUP(cartons × 2%)
// =====================================================================
export async function generatePlan(db: DB, s: Settings) {
  const planDate = planDateOf(s);
  const [lots, lastInsp, open] = await Promise.all([loadStockLots(db), loadLastInspMap(db), loadOpenPlans(db)]);
  const evaluated = evaluateLots(lots, lastInsp, s, planDate);
  const lotIdx = new Map<string, (typeof evaluated)[number]>();
  for (const l of evaluated) lotIdx.set(lotKey(l.jo, l.buyer_po), l);

  let rescheduled = 0;
  let removed = 0;
  // tải theo ngày (số thùng mẫu còn phải đo của các lô đang mở) – cân tối đa max_cartons_per_day
  const load = new Map<string, number>();
  const addLoad = (d: string, n: number) => load.set(d, (load.get(d) ?? 0) + n);
  for (const p of open) if (p.lot_result === "PENDING" || p.lot_result === "IN PROGRESS") addLoad(p.sched_date, Math.max(0, p.sample_cartons - p.cartons_tested));
  const openKeys = new Set<string>();
  const now = () => new Date().toISOString();

  for (const p of open) {
    if (p.kind === "REWORK") continue; // lượt kiểm lại sau tái chế: không bị kế hoạch hằng ngày hủy / dời
    const key = lotKey(p.jo, p.buyer_po);
    const lot = lotIdx.get(key);
    if (p.lot_result === "PENDING") {
      if (!lot || !lot.trigger) {
        const reason = !lot ? "Lô không còn trong báo cáo kho (đã xuất)" : "Không còn thuộc diện kiểm (quá BPO date / chưa đến hạn)";
        await db.from("inspection_readings").delete().eq("plan_id", p.plan_id);
        await db.from("inspection_plan").update({ status: "CANCELLED", cancel_reason: reason, updated_at: now() }).eq("plan_id", p.plan_id);
        removed++;
        continue;
      }
      const bpoChanged = (p.bpo_date ?? "") !== (lot.bpo_date ?? "");
      // v1.12: lô chưa đo, ngày kiểm còn ở tương lai → xếp lại theo quy tắc đợt hiện hành (lô lập theo rule cũ cũng được dồn về Thứ 2)
      const reflow = !bpoChanged && p.cartons_tested === 0 && p.sched_date > planDate && !!lot.sched_insp_date;
      if (bpoChanged || reflow) {
        addLoad(p.sched_date, -p.sample_cartons);
        const d = placeWithCapacity(lot.sched_insp_date!, p.sample_cartons, load, s.max_cartons_per_day, lastInspDay(lot.bpo_date, s));
        addLoad(d, p.sample_cartons);
        if (bpoChanged || d !== p.sched_date) {
          await db.from("inspection_plan").update({
            bpo_date: lot.bpo_date, trigger: lot.trigger, sched_date: d, updated_at: now(),
          }).eq("plan_id", p.plan_id);
          rescheduled++;
        }
      }
    }
    // cập nhật vị trí / pallet hiện tại cho mọi lô đang mở (QA luôn thấy vị trí mới nhất)
    if (lot) {
      await db.from("inspection_plan").update({
        locations: lot.locations, pallets: lot.pallets, location_pallets: lot.location_pallets,
      }).eq("plan_id", p.plan_id);
    }
    openKeys.add(key);
  }

  const prefix = planIdPrefix(planDate);
  const [{ data: pIds }, { data: hIds }] = await Promise.all([
    db.from("inspection_plan").select("plan_id").like("plan_id", `${prefix}%`),
    db.from("inspection_history").select("plan_id").like("plan_id", `${prefix}%`),
  ]);
  let seq = 0;
  for (const r of [...(pIds ?? []), ...(hIds ?? [])]) seq = Math.max(seq, Number(String(r.plan_id).slice(prefix.length)) || 0);

  const newPlans: object[] = [];
  const newReadings: object[] = [];
  // BPO sớm trước → được ưu tiên giữ ngày đợt khi vượt tải
  const sorted = evaluated
    .filter((l) => l.trigger)
    .sort((a, b) => (a.sched_insp_date! + (a.bpo_date ?? "") + a.brand_code).localeCompare(b.sched_insp_date! + (b.bpo_date ?? "") + b.brand_code));
  for (const l of sorted) {
    const key = lotKey(l.jo, l.buyer_po);
    if (openKeys.has(key)) continue;
    seq++;
    const planId = prefix + String(seq).padStart(3, "0");
    const cc = l.color_cartons ?? {};
    const n = sampleCartons(l.cartons, s, Object.keys(cc).length);
    const alloc = allocateColors(n, cc);
    const colorsSeq = colorSequence(alloc);
    const day = placeWithCapacity(l.sched_insp_date!, n, load, s.max_cartons_per_day, lastInspDay(l.bpo_date, s));
    addLoad(day, n);
    newPlans.push({
      plan_id: planId, brand_code: l.brand_code, customer: l.customer, jo: l.jo, buyer_po: l.buyer_po,
      style: l.style, color: l.colors, locations: l.locations, pallets: l.pallets, location_pallets: l.location_pallets,
      cartons: l.cartons, qty: l.qty, bpo_date: l.bpo_date, stock_in_date: l.stock_in_date,
      sched_date: day, trigger: l.trigger, sample_cartons: n, sample_colors: alloc, status: "OPEN",
    });
    for (let i = 1; i <= n; i++) newReadings.push({ plan_id: planId, sample_no: i, color: colorsSeq[i - 1] ?? null });
    openKeys.add(key);
  }
  await insertChunked(db, "inspection_plan", newPlans);
  await insertChunked(db, "inspection_readings", newReadings, 1000);
  return { newTasks: newPlans.length, rescheduled, removed, sampleRows: newReadings.length };
}

// =====================================================================
// 5. ARCHIVE (port ArchiveCompleted) – gom kết quả thùng thành 1 dòng Lịch sử
// =====================================================================
export async function archivePlan(db: DB, s: Settings, planId: string, userId?: string | null) {
  const { data: p, error } = await db.from("v_plan").select("*").eq("plan_id", planId).single();
  if (error || !p) throw new Error("Không tìm thấy kế hoạch " + planId);
  const plan = p as PlanView;
  if (plan.status !== "OPEN") return { archived: false, result: plan.final_result };
  const res = plan.lot_result;
  if (!(res === "PASS" || res === "FAIL") || plan.cartons_tested < plan.sample_cartons) return { archived: false, result: res };

  const { data: rv } = await db.from("inspection_readings").select("*").eq("plan_id", planId).order("sample_no");
  const rows = (rv ?? []) as ReadingRow[];
  let inspDt: string | null = null;
  const audit: string[] = [], qic: string[] = [], lp: string[] = [], groups: string[] = [];
  let sum = 0, cnt = 0, max: number | null = null;
  for (const r of rows) {
    if (r.reading_count > 0 && r.inspection_date && (!inspDt || r.inspection_date > inspDt)) inspDt = r.inspection_date;
    if (r.location || r.pallet) lp.push(`${r.location ?? ""}/${r.pallet ?? ""}`);
    if (r.audit_carton_no) audit.push(r.audit_carton_no);
    if (r.qty_in_carton) qic.push(r.qty_in_carton);
    const g: string[] = [];
    for (const x of [r.r1, r.r2, r.r3]) {
      if (x === null || x === undefined) continue;
      const v = Number(x);
      g.push(fmtReading(v));
      sum += v; cnt++;
      if (max === null || v > max) max = v;
    }
    if (g.length) groups.push(g.join("/"));
  }
  inspDt = inspDt ?? plan.inspection_date ?? plan.sched_date;
  if (plan.kind === "REWORK") return closeRework(db, s, plan, res, max, inspDt!, groups, userId);
  const rework = plan.rework_humidity === null ? null : Number(plan.rework_humidity);

  const hist = {
    plan_id: planId, inspection_date: inspDt, brand_code: plan.brand_code, jo: plan.jo, color: plan.color, bpo: plan.buyer_po,
    stock_in_date: plan.stock_in_date, exfty_date: plan.bpo_date, total_cartons: plan.cartons,
    audit_carton_no: audit.join(","), qty_in_carton: qic.join(","), readings: groups.join(" | "), reading_count: cnt,
    cartons_tested: plan.cartons_tested, sample_required: plan.sample_cartons,
    sampling_check: plan.cartons_tested >= plan.sample_cartons ? "OK" : "UNDER",
    max_humidity: max, avg_humidity: cnt ? Math.round((sum / cnt) * 100) / 100 : null, result: res, qa: plan.qa_name,
    rework_humidity: rework, trigger: plan.trigger + (plan.remark ? ` | ${plan.remark}` : ""),
    source: res === "FAIL" && rework === null ? "SYSTEM - CAPA/REWORK REQUIRED" : "SYSTEM",
    archived_on: todayVN(), location_pallet: lp.join(", "),
  };
  const { error: e1 } = await db.from("inspection_history").upsert(hist);
  if (e1) throw new Error("Lưu lịch sử lỗi: " + e1.message);
  await db.from("inspection_plan").update({ status: "ARCHIVED", final_result: res, inspection_date: inspDt, updated_at: new Date().toISOString() }).eq("plan_id", planId);

  let capaNo: string | null = null;
  // v1.7: bỏ CAPA – lô FAIL xử lý bằng "Kiểm lại sau tái chế" trên app điện thoại / Lịch sử kiểm
  if (res === "FAIL" && CAPA_ENABLED) capaNo = await createCapaForPlan(db, s, plan, max, inspDt!, userId);
  await log(db, "ARCHIVE", { planId, result: res, capaNo }, userId);
  return { archived: true, result: res, capaNo };
}

/**
 * Đóng lượt KIỂM LẠI SAU TÁI CHẾ: không tạo dòng Lịch sử mới (không làm sai thống kê PASS/FAIL),
 * mà ghi độ ẩm sau tái chế (= max lần đo lại) vào dòng Lịch sử của lô gốc + cập nhật CAPA.
 */
async function closeRework(db: DB, s: Settings, plan: PlanView, res: string, max: number | null, inspDt: string, groups: string[], userId?: string | null) {
  const parent = plan.parent_plan_id!;
  const pass = res === "PASS";
  const note = `Kiểm lại ${fmtDate(inspDt)} (${plan.plan_id}): ${groups.join(" | ")} → ${pass ? "ĐẠT" : "KHÔNG ĐẠT"}`;
  await db.from("inspection_plan").update({ status: "ARCHIVED", final_result: res, inspection_date: inspDt, updated_at: new Date().toISOString() }).eq("plan_id", plan.plan_id);
  const { data: h } = await db.from("inspection_history").select("trigger").eq("plan_id", parent).maybeSingle();
  await db.from("inspection_history").update({
    ...(pass ? { rework_humidity: max, source: "SYSTEM" } : {}),
    trigger: [h?.trigger, note].filter(Boolean).join(" | "),
  }).eq("plan_id", parent);
  const { data: capa } = await db.from("capa").select("id,status").eq("history_plan_id", parent).maybeSingle();
  if (capa) {
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (pass) { upd.rework_humidity = max; if (["OPEN", "IN_PROGRESS"].includes(capa.status)) upd.status = "VERIFICATION"; }
    else if (capa.status === "OPEN") upd.status = "IN_PROGRESS";
    await db.from("capa").update(upd).eq("id", capa.id);
    await db.from("capa_logs").insert({ capa_id: capa.id, action: pass ? "KIỂM LẠI ĐẠT" : "KIỂM LẠI KHÔNG ĐẠT", note: `${note}${max !== null ? ` · max ${max}%` : ""} · ngưỡng ${s.hum_limit}%`, user_id: userId ?? null });
  }
  await log(db, "REWORK_CLOSE", { planId: plan.plan_id, parent, result: res, max }, userId);
  return { archived: true, result: res, capaNo: null as string | null, rework: true };
}

export async function archiveCompleted(db: DB, s: Settings) {
  const open = await loadOpenPlans(db);
  let n = 0;
  for (const p of open) {
    if ((p.lot_result === "PASS" || p.lot_result === "FAIL") && p.cartons_tested >= p.sample_cartons) {
      const r = await archivePlan(db, s, p.plan_id);
      if (r.archived) n++;
    }
  }
  return n;
}

// ===================================================================== 10. CAPA – tự tạo khi lô FAIL (tắt từ v1.7)
const CAPA_ENABLED = false;
export async function nextCapaNo(db: DB): Promise<string> {
  const t = todayVN();
  const prefix = `CAPA-${t.slice(2, 4)}${t.slice(5, 7)}-`;
  const { data } = await db.from("capa").select("capa_no").like("capa_no", `${prefix}%`);
  let seq = 0;
  for (const r of data ?? []) seq = Math.max(seq, Number(String(r.capa_no).slice(prefix.length)) || 0);
  return prefix + String(seq + 1).padStart(3, "0");
}

async function createCapaForPlan(db: DB, s: Settings, plan: PlanView, max: number | null, inspDt: string, userId?: string | null) {
  const { data: exist } = await db.from("capa").select("capa_no").eq("history_plan_id", plan.plan_id).maybeSingle();
  if (exist) return exist.capa_no as string;
  const capaNo = await nextCapaNo(db);
  const rework = plan.rework_humidity === null ? null : Number(plan.rework_humidity);
  const { data, error } = await db.from("capa").insert({
    capa_no: capaNo, plan_id: plan.plan_id, history_plan_id: plan.plan_id, brand_code: plan.brand_code, jo: plan.jo,
    buyer_po: plan.buyer_po, color: plan.color, inspection_date: inspDt, max_humidity: max, hum_limit: s.hum_limit,
    failed_cartons: plan.fail_cartons,
    problem: `Lô ${plan.jo} / ${plan.buyer_po} kiểm ẩm ngày ${fmtDate(inspDt)}: ${plan.fail_cartons} thùng mẫu vượt ${s.hum_limit}% (max ${max ?? ""}%).${plan.remark ? " Ghi chú QA: " + plan.remark : ""}`,
    rework_humidity: rework,
    status: rework !== null && rework <= s.hum_limit ? "VERIFICATION" : "OPEN",
    source: "AUTO", created_by: userId ?? null,
  }).select("id").single();
  if (error) throw new Error("Tạo CAPA lỗi: " + error.message);
  await db.from("capa_logs").insert({ capa_id: data!.id, action: "CREATED", note: "Tự tạo khi lô FAIL", user_id: userId ?? null });
  return capaNo;
}

// =====================================================================
// 0. DAILY PROCESS (port RunDailyProcess): Import → Stock Lots → Archive → Plan → Sample rows
// =====================================================================
export async function runImport(
  db: DB, s: Settings, buffer: Buffer, fileName: string,
  source: "upload" | "webhook", userId?: string | null, force = false,
): Promise<DailyProcessResult> {
  if (!force && s.last_imported_file && s.last_imported_file.toLowerCase() === fileName.toLowerCase()) {
    return {
      fileName, reportDate: dateFromName(fileName), cartonsImported: 0, includedCartons: 0, stockLots: 0, archived: 0,
      newTasks: 0, rescheduled: 0, removed: 0, sampleRows: 0, newBrands: [], newStores: [], skipped: true,
      message: `Báo cáo ${fileName} đã được nạp trước đó.`,
    };
  }
  // v1.8.1: không cho báo cáo CŨ HƠN báo cáo đang dùng ghi đè tồn kho (macro Outlook quét bù mail các ngày trước)
  const newDate = dateFromName(fileName);
  const curDate = s.last_imported_file ? dateFromName(s.last_imported_file) : null;
  if (!force && newDate && curDate && newDate < curDate) {
    return {
      fileName, reportDate: newDate, cartonsImported: 0, includedCartons: 0, stockLots: 0, archived: 0,
      newTasks: 0, rescheduled: 0, removed: 0, sampleRows: 0, newBrands: [], newStores: [], skipped: true,
      message: `Bỏ qua ${fileName}: cũ hơn báo cáo đang dùng (${s.last_imported_file}).`,
    };
  }
  const parsed = await parseWarehouseReport(buffer, s.warehouse_sheet);
  if (parsed.cartons.length === 0) throw new Error("Báo cáo kho không có dòng dữ liệu nào – kiểm tra lại file.");

  const [{ data: stores }, { data: brands }] = await Promise.all([
    db.from("stores").select("store_name,include"),
    db.from("brand_map").select("brand_name,brand_code"),
  ]);
  const included = new Set((stores ?? []).filter((x) => x.include).map((x) => x.store_name as string));
  const known = new Set((stores ?? []).map((x) => String(x.store_name).toUpperCase()));
  const bmap = new Map((brands ?? []).map((b) => [b.brand_name as string, b.brand_code as string]));
  const built = buildStockLots({ cartons: parsed.cartons, includedStores: included, brandMap: bmap, gradeFilter: s.grade_filter });

  const newBrands = Array.from(built.newBrands);
  if (newBrands.length) {
    await db.from("brand_map").upsert(
      newBrands.map(([brand_name, brand_code]) => ({
        brand_name, brand_code, auto_added: true, note: `AUTO-ADDED ${fmtDate(todayVN(), "dmmy")} - please review`,
      })),
      { onConflict: "brand_name", ignoreDuplicates: true },
    );
  }
  const newStores: string[] = [];
  for (const [store_name, rows] of built.storeCounts) {
    if (!store_name) continue;
    if (!known.has(store_name.toUpperCase())) {
      newStores.push(store_name);
      await db.from("stores").insert({ store_name, rows_in_report: rows, include: false, note: "Store mới – xem có tính tồn không" });
    } else {
      await db.from("stores").update({ rows_in_report: rows, updated_at: new Date().toISOString() }).eq("store_name", store_name);
    }
  }

  const reportDate = dateFromName(fileName);
  const { data: imp, error: impErr } = await db.from("warehouse_imports").insert({
    file_name: fileName, report_date: reportDate, source, carton_rows: parsed.cartons.length,
    included_rows: built.includedCartons, lot_count: built.lots.length, imported_by: userId ?? null,
  }).select("id").single();
  if (impErr) throw new Error(impErr.message);

  const { error: delErr } = await db.from("stock_lots").delete().gte("id", 0);
  if (delErr) throw new Error(delErr.message);
  await insertChunked(db, "stock_lots", built.lots.map((l) => ({ ...l, import_id: imp!.id })));
  await db.from("settings").update({ last_imported_file: fileName, last_import_time: new Date().toISOString() }).eq("id", 1);

  const archived = await archiveCompleted(db, s);
  const plan = await generatePlan(db, s);
  const result: DailyProcessResult = {
    fileName, reportDate, cartonsImported: parsed.cartons.length, includedCartons: built.includedCartons,
    stockLots: built.lots.length, archived, ...plan, newBrands: newBrands.map(([b]) => b), newStores,
  };
  await db.from("warehouse_imports").update({ stats: result }).eq("id", imp!.id);
  await log(db, "DAILY_PROCESS", result, userId);
  return result;
}

/** Lập lại kế hoạch với tồn kho hiện có (không cần file mới) – nút & cron */
export async function runPlanning(db: DB, s: Settings, userId?: string | null) {
  const archived = await archiveCompleted(db, s);
  const plan = await generatePlan(db, s);
  const out = { archived, ...plan };
  await log(db, "REPLAN", out, userId);
  return out;
}
