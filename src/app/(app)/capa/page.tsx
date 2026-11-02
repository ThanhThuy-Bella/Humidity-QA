import Link from "next/link";
import { ExportLink, PageHeader } from "@/components/ui";
import { capaRows } from "@/lib/queries";
import { fmtDate, todayVN } from "@/lib/dates";
import { pct } from "@/lib/format";

type SP = Promise<{ status?: string }>;
const VN: Record<string, string> = { OPEN: "Mở", IN_PROGRESS: "Đang xử lý", VERIFICATION: "Chờ xác nhận", CLOSED: "Đóng", CANCELLED: "Hủy" };
const TONE: Record<string, string> = { OPEN: "bg-fail-bg text-fail", IN_PROGRESS: "bg-input text-warn", VERIFICATION: "bg-prog-bg text-teal-dark", CLOSED: "bg-pass-bg text-pass", CANCELLED: "bg-[#F1F4F6] text-mute" };

export default async function CapaPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const rows = await capaRows(sp.status);
  const t = todayVN();
  return (
    <>
      <PageHeader title="CAPA" sub="Phiếu tự tạo khi lô FAIL; tạo thủ công từ Lịch sử kiểm" actions={<ExportLink href={`/api/export/capa${sp.status ? `?status=${sp.status}` : ""}`} />} />
      <div className="flex flex-wrap gap-2 mb-3 text-sm no-print">
        <Link href="/capa" className={!sp.status ? "btn" : "btn-ghost"}>Tất cả</Link>
        {Object.entries(VN).map(([k, v]) => <Link key={k} href={`/capa?status=${k}`} className={sp.status === k ? "btn" : "btn-ghost"}>{v}</Link>)}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>CAPA No</th><th>Trạng thái</th><th>Brand</th><th>JO</th><th>Buyer PO</th><th>Ngày kiểm</th><th className="num">Max</th><th className="num">Thùng FAIL</th><th>Phụ trách</th><th>Hạn</th><th className="num">Sau tái chế</th><th>Nguồn</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const overdue = c.due_date && c.due_date < t && !["CLOSED", "CANCELLED"].includes(c.status);
              return (
                <tr key={c.id}>
                  <td><Link href={`/capa/${c.id}`} className="font-semibold text-teal-dark hover:underline">{c.capa_no}</Link></td>
                  <td><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TONE[c.status]}`}>{VN[c.status]}</span></td>
                  <td>{c.brand_code}</td><td>{c.jo}</td><td>{c.buyer_po}</td><td>{fmtDate(c.inspection_date)}</td>
                  <td className="num text-fail">{pct(c.max_humidity)}</td><td className="num">{c.failed_cartons}</td><td>{c.owner}</td>
                  <td className={overdue ? "text-fail font-semibold" : ""}>{fmtDate(c.due_date)}</td><td className="num">{pct(c.rework_humidity)}</td>
                  <td className="text-mute text-xs">{c.source === "AUTO" ? "Tự động" : "Thủ công"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={12} className="py-6 text-center text-mute">Chưa có phiếu CAPA.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
