import { ExportLink, PageHeader, Priority, TriggerText } from "@/components/ui";
import { evaluatedStock } from "@/lib/queries";
import { loadSettings, planDateOf } from "@/lib/settings";
import { fmtDate } from "@/lib/dates";
import { n0 } from "@/lib/format";

type SP = Promise<{ brand?: string; status?: string; trig?: string; q?: string }>;
const STATUS_VN: Record<string, string> = { DUE: "Đến hạn", LATER: "Chưa đến hạn", OVERDUE: "Quá BPO date", "NO BPO": "Chưa có BPO" };

// Sheet Stock_Lots (tblLots + cột công thức)
export default async function StockPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const s = await loadSettings();
  const all = await evaluatedStock(s);
  const brands = Array.from(new Set(all.map((l) => l.brand_code))).sort();
  const q = (sp.q ?? "").trim().toUpperCase();
  const rows = all
    .filter((l) => (!sp.brand || l.brand_code === sp.brand) && (!sp.status || l.bpo_status === sp.status)
      && (!sp.trig || (sp.trig === "Y" ? !!l.trigger : !l.trigger))
      && (!q || l.jo.toUpperCase().includes(q) || l.buyer_po.toUpperCase().includes(q) || (l.style ?? "").toUpperCase().includes(q)))
    .sort((a, b) => (a.bpo_date ?? "9999").localeCompare(b.bpo_date ?? "9999"));

  return (
    <>
      <PageHeader title="Tồn kho theo lô"
        sub={<>Grade {s.grade_filter || "mọi"} · store được tính · tính theo ngày {fmtDate(planDateOf(s))} · {n0(all.length)} lô · {n0(all.reduce((a, l) => a + l.cartons, 0))} thùng</>}
        actions={<ExportLink href="/api/export/stock" />} />
      <form className="flex flex-wrap gap-2 mb-3 no-print" method="get">
        <select name="brand" defaultValue={sp.brand ?? ""} className="input"><option value="">Mọi brand</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input"><option value="">Mọi trạng thái BPO</option>{Object.entries(STATUS_VN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="trig" defaultValue={sp.trig ?? ""} className="input"><option value="">Tất cả</option><option value="Y">Cần kiểm</option><option value="N">Không cần kiểm</option></select>
        <input name="q" defaultValue={sp.q} placeholder="Tìm JO / PO / Style" className="input w-52" />
        <button className="btn-ghost">Lọc</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            <th>Brand</th><th>JO</th><th>Buyer PO</th><th>Style</th><th>Màu</th><th>Vị trí</th><th className="num">Thùng</th><th className="num">SL</th>
            <th>BPO date</th><th>Nhập kho</th><th className="num">Ngày trong kho</th><th className="num">Còn đến BPO</th>
            <th>Kiểm gần nhất</th><th>Ngày kiểm dự kiến</th><th className="num">ISO (ngày)</th><th className="num">Tồn lúc kiểm</th>
            <th>BPO</th><th>Cần kiểm</th><th>Ưu tiên</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 1500).map((l) => (
              <tr key={`${l.brand_code}|${l.jo}|${l.buyer_po}`}>
                <td>{l.brand_code}</td><td className="font-medium">{l.jo}</td><td>{l.buyer_po}</td>
                <td className="max-w-[160px] truncate" title={l.style}>{l.style}</td><td className="max-w-[120px] truncate" title={l.colors}>{l.colors}</td>
                <td className="max-w-[120px] truncate" title={l.locations}>{l.locations}</td>
                <td className="num">{n0(l.cartons)}</td><td className="num">{n0(l.qty)}</td>
                <td>{fmtDate(l.bpo_date)}</td><td>{fmtDate(l.stock_in_date)}</td><td className="num">{l.days_in_wh}</td>
                <td className={`num ${l.days_to_bpo !== null && l.days_to_bpo < 0 ? "text-warn" : ""}`}>{l.days_to_bpo}</td>
                <td>{fmtDate(l.last_insp_date)}</td><td>{fmtDate(l.sched_insp_date)}</td><td className="num">{l.iso_min_days}</td>
                <td className="num">{l.days_in_wh_at_insp}</td><td className="whitespace-nowrap">{STATUS_VN[l.bpo_status]}</td>
                <td className="whitespace-nowrap font-medium text-teal-dark"><TriggerText t={l.trigger} /></td><td><Priority p={l.priority} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1500 && <p className="text-xs text-mute mt-2">Hiển thị 1.500 / {n0(rows.length)} lô – dùng bộ lọc hoặc Xuất Excel để xem đủ.</p>}
    </>
  );
}
