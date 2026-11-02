import Link from "next/link";
import { ExportLink, PageHeader, Priority, ResultBadge, TriggerText } from "@/components/ui";
import ActionButton from "@/components/ActionButton";
import { openPlans } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/dates";
import { n0, pct } from "@/lib/format";
import { getProfile } from "@/lib/auth";

type SP = Promise<{ brand?: string; result?: string; priority?: string; q?: string; tab?: string }>;

// Sheet Humidity_Plan (tblPlan)
export default async function PlanPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getProfile();
  const all = await openPlans();
  const brands = Array.from(new Set(all.map((p) => p.brand_code))).sort();
  const q = (sp.q ?? "").trim().toUpperCase();
  const rows = all.filter((p) =>
    (!sp.brand || p.brand_code === sp.brand) && (!sp.result || p.lot_result === sp.result) && (!sp.priority || p.priority === sp.priority) &&
    (!q || p.jo.toUpperCase().includes(q) || p.buyer_po.toUpperCase().includes(q) || p.plan_id.includes(q)),
  );
  const { data: cancelled } = sp.tab === "cancelled"
    ? await supabaseAdmin().from("inspection_plan").select("plan_id,brand_code,jo,buyer_po,sched_date,bpo_date,cancel_reason,updated_at").eq("status", "CANCELLED").order("updated_at", { ascending: false }).limit(200)
    : { data: null };

  return (
    <>
      <PageHeader title="Kế hoạch kiểm ẩm" sub={`${all.length} lô đang mở · sắp xếp theo ngày kiểm, brand`}
        actions={<>
          {me && ["admin", "planner"].includes(me.role) && (
            <ActionButton url="/api/plan/regenerate" label="Lập lại kế hoạch" ghost
              render={(d) => `${d.newTasks} lô mới · ${d.rescheduled} dời lịch · ${d.removed} hủy · ${d.archived} đóng`} />
          )}
          <ExportLink href="/api/export/plan" />
        </>} />
      <div className="flex gap-4 mb-3 text-sm no-print">
        <Link href="/plan" className={sp.tab !== "cancelled" ? "font-semibold text-teal-dark underline" : "text-mute"}>Đang mở</Link>
        <Link href="/plan?tab=cancelled" className={sp.tab === "cancelled" ? "font-semibold text-teal-dark underline" : "text-mute"}>Đã hủy gần đây</Link>
      </div>
      {sp.tab === "cancelled" ? (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>PlanID</th><th>Brand</th><th>JO</th><th>Buyer PO</th><th>Ngày kiểm</th><th>BPO date</th><th>Lý do hủy</th><th>Lúc</th></tr></thead>
            <tbody>{(cancelled ?? []).map((c) => (
              <tr key={c.plan_id}><td>{c.plan_id}</td><td>{c.brand_code}</td><td>{c.jo}</td><td>{c.buyer_po}</td>
                <td>{fmtDate(c.sched_date)}</td><td>{fmtDate(c.bpo_date)}</td><td>{c.cancel_reason}</td><td>{fmtDate(String(c.updated_at).slice(0, 10))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <>
          <form className="flex flex-wrap gap-2 mb-3 no-print" method="get">
            <select name="brand" defaultValue={sp.brand ?? ""} className="input"><option value="">Mọi brand</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
            <select name="result" defaultValue={sp.result ?? ""} className="input">
              <option value="">Mọi trạng thái</option><option value="PENDING">Chờ kiểm</option><option value="IN PROGRESS">Đang kiểm</option><option value="FAIL">FAIL (chưa đủ mẫu)</option>
            </select>
            <select name="priority" defaultValue={sp.priority ?? ""} className="input"><option value="">Mọi ưu tiên</option><option value="LATE">Trễ hạn</option><option value="ON TIME">Đúng hạn</option></select>
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Tìm JO / PO / PlanID" className="input w-52" />
            <button className="btn-ghost">Lọc</button>
          </form>
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Ngày kiểm ẩm</th><th>Brand</th><th>JO</th><th>Buyer PO</th><th className="num">Thùng</th><th className="num">SL</th>
                <th>BPO date</th><th>Nhập kho</th><th className="num">Ngày trong kho</th><th className="num">Tuần (ngưỡng)</th>
                <th className="num">Mẫu</th><th className="num">Đã đo</th><th className="num">Max</th><th>Kết quả</th>
                <th>Kiểm trước</th><th>Ưu tiên</th><th>Loại</th><th>Vị trí</th><th>PlanID</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.plan_id}>
                    <td>{fmtDate(p.sched_date)}</td><td>{p.brand_code}</td>
                    <td><Link href={`/inspect?lot=${encodeURIComponent(p.plan_id)}`} className="font-semibold text-teal-dark hover:underline">{p.jo}</Link></td>
                    <td>{p.buyer_po}</td><td className="num">{n0(p.cartons)}</td><td className="num">{n0(p.qty)}</td>
                    <td>{fmtDate(p.bpo_date)}</td><td>{fmtDate(p.stock_in_date)}</td><td className="num">{p.days_in_wh}</td>
                    <td className="num">{p.aging_weeks} ({p.threshold_weeks})</td><td className="num">{p.sample_cartons}</td>
                    <td className="num">{p.cartons_tested}</td><td className="num">{pct(p.max_humidity)}</td>
                    <td><ResultBadge r={p.lot_result} /></td><td>{fmtDate(p.insp_by)}</td><td><Priority p={p.priority} /></td>
                    <td className="whitespace-nowrap"><TriggerText t={p.trigger} /></td>
                    <td className="max-w-[140px] truncate" title={p.locations ?? ""}>{p.locations}</td><td className="text-mute">{p.plan_id}</td>
                    <td><Link href={`/inspect?lot=${encodeURIComponent(p.plan_id)}`} className="btn h-8 px-3 whitespace-nowrap">Nhập kết quả</Link></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={20} className="py-6 text-center text-mute">Không có lô nào khớp bộ lọc.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
