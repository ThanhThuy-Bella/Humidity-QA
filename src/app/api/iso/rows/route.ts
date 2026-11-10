import { handle } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayVN } from "@/lib/dates";
import type { PlanRow, ReadingRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v1.10 – Dòng cho file "HUMIDITY REPORT <năm>.xlsx" (form ISO, Sheet1, cột A–Y).
 * Macro Outlook gọi:  GET /api/iso/rows?from=yyyy-mm-dd   header x-webhook-secret: <IMPORT_WEBHOOK_SECRET>
 * Trả TSV UTF-8 (dễ đọc bằng VBA), mỗi dòng 1 dòng ISO:
 *   Date | Buyer | JO | Color | BPO | StockIn | ExFty | TotalCtn | AuditCtn | QtyInCtn | 12 số đo (K–V) | Result | QA | Y
 * Quy tắc (chị Ana duyệt 10/11/2026):
 *  - Chỉ lô đã ĐẠT: lô PASS lần đầu; lô FAIL chỉ ghi khi lượt kiểm lại PASS (ghi số đo lần đạt, Y = "Đã tái chế").
 *  - 1 dòng / màu; màu > 4 thùng mẫu → tách dòng, mỗi dòng tối đa 4 thùng (12 số đo).
 *  - Buyer = mã brand ngắn (CHA, GIO…).
 */
export const GET = handle(async (req: Request) => {
  if (!process.env.IMPORT_WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== process.env.IMPORT_WEBHOOK_SECRET)
    throw new HttpError(401, "Sai webhook secret");
  const url = new URL(req.url);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : todayVN();
  const db = supabaseAdmin();

  const { data: plans, error } = await db.from("inspection_plan").select("*")
    .eq("status", "ARCHIVED").eq("final_result", "PASS").gte("inspection_date", from)
    .order("inspection_date").order("plan_id");
  if (error) throw new Error(error.message);
  const list = (plans ?? []) as PlanRow[];
  const ids = list.map((p) => p.plan_id);

  const readings: ReadingRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("inspection_readings").select("*").in("plan_id", ids.slice(i, i + 200)).order("sample_no");
    readings.push(...((data ?? []) as ReadingRow[]));
  }
  const byPlan = new Map<string, ReadingRow[]>();
  for (const r of readings) (byPlan.get(r.plan_id) ?? byPlan.set(r.plan_id, []).get(r.plan_id)!).push(r);

  // số thùng theo màu (từ báo cáo kho mới nhất) cho cột H
  const jos = Array.from(new Set(list.map((p) => p.jo)));
  const colorCtn = new Map<string, Record<string, number>>();
  for (let i = 0; i < jos.length; i += 200) {
    const { data } = await db.from("stock_lots").select("jo,buyer_po,color_cartons").in("jo", jos.slice(i, i + 200));
    for (const s of (data ?? []) as { jo: string; buyer_po: string; color_cartons: Record<string, number> | null }[])
      if (s.color_cartons && Object.keys(s.color_cartons).length) colorCtn.set(`${s.jo}|${s.buyer_po}`.toUpperCase(), s.color_cartons);
  }

  const out: string[][] = [];
  for (const p of list) {
    const rows = (byPlan.get(p.plan_id) ?? []).filter((r) => r.reading_count > 0);
    if (!rows.length) continue;
    const groups = new Map<string, ReadingRow[]>();
    for (const r of rows) {
      const c = (r.color ?? p.color ?? "").trim();
      (groups.get(c) ?? groups.set(c, []).get(c)!).push(r);
    }
    const cc = colorCtn.get(`${p.jo}|${p.buyer_po}`.toUpperCase()) ?? {};
    for (const [color, rs] of groups) {
      const total = groups.size === 1 ? p.cartons : cc[color] ?? p.cartons;
      for (let k = 0; k < rs.length; k += 4) {
        const chunk = rs.slice(k, k + 4);
        const vals: string[] = [];
        for (const r of chunk) for (const v of [r.r1, r.r2, r.r3]) if (v !== null && v !== undefined) vals.push(String(Number(v)));
        while (vals.length < 12) vals.push("");
        const date = chunk.reduce((d, r) => (r.inspection_date && r.inspection_date > d ? r.inspection_date : d), "") || p.inspection_date || "";
        out.push([
          date, p.brand_code ?? "", p.jo, color, p.buyer_po ?? "", p.stock_in_date ?? "", p.bpo_date ?? "", String(total ?? ""),
          chunk.map((r) => r.audit_carton_no ?? "").join(","), chunk.map((r) => r.qty_in_carton ?? "").join(","),
          ...vals.slice(0, 12), "PASS", p.qa_name ?? "", p.kind === "REWORK" ? "Đã tái chế" : "",
        ]);
      }
    }
  }
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  const body = out.map((r) => r.map(clean).join("\t")).join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
});
