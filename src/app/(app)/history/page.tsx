import Link from "next/link";
import { ExportLink, PageHeader, ResultBadge } from "@/components/ui";
import ReworkButton from "@/components/ReworkButton";
import { historyRows } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/dates";
import { pct } from "@/lib/format";

type SP = Promise<{ from?: string; to?: string; brand?: string; result?: string; q?: string; page?: string }>;
const PAGE = 100;

// Sheet Inspection_History (tblHistory)
export default async function HistoryPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const rows = await historyRows(sp);
  const db = supabaseAdmin();
  const [{ data: brandRows }, { data: openRework }] = await Promise.all([
    db.from("brand_map").select("brand_code"),
    db.from("inspection_plan").select("parent_plan_id").eq("kind", "REWORK").eq("status", "OPEN"),
  ]);
  const reworking = new Set((openRework ?? []).map((r) => r.parent_plan_id as string));
  const brands = Array.from(new Set([...(brandRows ?? []).map((b) => b.brand_code), ...rows.map((r) => r.brand_code)].filter(Boolean))).sort() as string[];
  const page = Math.max(1, Number(sp.page ?? 1));
  const view = rows.slice((page - 1) * PAGE, page * PAGE);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  const pass = rows.filter((r) => r.result === "PASS").length;
  const fail = rows.filter((r) => r.result === "FAIL").length;

  return (
    <>
      <PageHeader title="Lịch sử kiểm" sub={`${rows.length} lô · PASS ${pass} · FAIL ${fail}`} actions={<ExportLink href={`/api/export/history?${qs}`} />} />
      <form className="flex flex-wrap gap-2 mb-3 no-print" method="get">
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="Từ ngày" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="Đến ngày" />
        <select name="brand" defaultValue={sp.brand ?? ""} className="input"><option value="">Mọi brand</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
        <select name="result" defaultValue={sp.result ?? ""} className="input"><option value="">Mọi kết quả</option><option>PASS</option><option>FAIL</option><option>NO DATA</option></select>
        <input name="q" defaultValue={sp.q} placeholder="Tìm JO / BPO / PlanID" className="input w-52" />
        <button className="btn-ghost">Lọc</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            <th>Ngày kiểm</th><th>Brand</th><th>JO</th><th>Màu</th><th>BPO</th><th>Nhập kho</th><th>Ex-FTY</th>
            <th className="num">Thùng</th><th>Số thùng kiểm</th><th>SL áo</th><th>Số đo (%)</th>
            <th className="num">Mẫu</th><th>Lấy mẫu</th><th className="num">Max</th><th className="num">TB</th><th>Kết quả</th>
            <th>QA</th><th className="num">Tái chế</th><th>Trạng thái</th><th>Kiểm lại</th><th>PlanID</th>
          </tr></thead>
          <tbody>
            {view.map((h) => {
              return (
                <tr key={h.plan_id}>
                  <td>{fmtDate(h.inspection_date)}</td><td>{h.brand_code}</td><td className="font-medium">{h.jo}</td><td className="max-w-[120px] truncate">{h.color}</td>
                  <td>{h.bpo}</td><td>{fmtDate(h.stock_in_date)}</td><td>{fmtDate(h.exfty_date)}</td>
                  <td className="num">{h.total_cartons}</td><td>{h.audit_carton_no}</td><td>{h.qty_in_carton}</td>
                  <td className="whitespace-nowrap">{h.readings}</td>
                  <td className="num">{h.cartons_tested}/{h.sample_required}</td>
                  <td className={h.sampling_check === "UNDER" ? "text-warn font-semibold" : ""}>{h.sampling_check}</td>
                  <td className="num">{pct(h.max_humidity)}</td><td className="num">{pct(h.avg_humidity, 2)}</td>
                  <td><ResultBadge r={h.result} /></td><td>{h.qa}</td><td className="num">{pct(h.rework_humidity)}</td>
                  <td className="text-xs whitespace-nowrap">{h.result !== "FAIL" ? <span className="text-mute">—</span>
                    : h.rework_humidity !== null ? <span className="text-pass font-semibold">Đạt sau tái chế</span>
                    : reworking.has(h.plan_id) ? <span className="text-warn font-semibold">Đang kiểm lại</span>
                    : <span className="text-fail font-semibold">Chờ tái chế / kiểm lại</span>}</td>
                  <td>{h.result === "FAIL" && h.plan_id.startsWith("HI-") && h.rework_humidity === null && <ReworkButton planId={h.plan_id} target="mobile" size="sm" label={reworking.has(h.plan_id) ? "Mở lượt kiểm lại" : "Kiểm lại"} />}</td>
                  <td className="text-mute">{h.plan_id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && (
        <div className="flex gap-3 mt-3 text-sm no-print">
          {page > 1 && <Link className="underline" href={`/history?${qs}&page=${page - 1}`}>← Trang trước</Link>}
          <span className="text-mute">Trang {page}/{Math.ceil(rows.length / PAGE)}</span>
          {page * PAGE < rows.length && <Link className="underline" href={`/history?${qs}&page=${page + 1}`}>Trang sau →</Link>}
        </div>
      )}
    </>
  );
}
