/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ExportLink, PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { loadSettings } from "@/lib/settings";
import { dueLots, openPlans } from "@/lib/queries";
import { fmtDate, todayVN } from "@/lib/dates";

type SP = Promise<{ date?: string; mode?: string }>;

// Sheet Form_Print (BuildInspectionForm / PrintFormPDF) + tem QR cho Mobile Inspection
export default async function FormPrintPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const s = await loadSettings();
  const d = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayVN();
  const rows = dueLots(await openPlans(), d, false);
  const mode = sp.mode === "labels" ? "labels" : "form";
  const qr = (id: string) => `/api/qr/${encodeURIComponent(id)}`;

  return (
    <>
      <div className="no-print">
        <PageHeader title="In biểu mẫu & QR" sub={`${rows.length} lô trên biểu mẫu ngày ${fmtDate(d)}`}
          actions={<><PrintButton /><ExportLink href={`/api/export/form?date=${d}`} /></>} />
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input type="date" name="date" defaultValue={d} className="input" aria-label="Ngày in" />
          <input type="hidden" name="mode" value={mode} />
          <button className="btn-ghost">Xem</button>
          <span className="mx-2 border-l border-line" />
          <Link href={`/form-print?date=${d}`} className={mode === "form" ? "btn" : "btn-ghost"}>Biểu mẫu giấy</Link>
          <Link href={`/form-print?date=${d}&mode=labels`} className={mode === "labels" ? "btn" : "btn-ghost"}>Tem QR dán thùng mẫu</Link>
        </form>
      </div>
      {mode === "form" ? (
        <div className="bg-white p-6 border border-line print:border-0 print:p-0 font-[Times_New_Roman,serif] text-black">
          <div className="text-center">
            <div className="font-bold text-[15px]">{s.company_name}</div>
            <div className="text-xs">{s.company_address}</div>
            <div className="text-xs">{s.company_tel}</div>
            <div className="font-bold text-xl mt-3">HUMIDITY REPORT</div>
            <div className="text-xs mt-1">Kho: {s.form_warehouse} &nbsp;&nbsp;&nbsp; Date (Ngày): {fmtDate(d)} &nbsp;&nbsp;&nbsp; Chuẩn: ≤ {s.hum_limit}% = P; &gt; {s.hum_limit}% = F; {s.readings_per_carton} điểm đo/thùng</div>
          </div>
          <table className="w-full mt-3 border-collapse text-[11px] [&_td]:border [&_th]:border [&_td]:border-black [&_th]:border-black [&_td]:px-1 [&_th]:px-1 [&_td]:text-center [&_th]:font-bold">
            <thead><tr className="h-16">
              <th>Date<br />(Ngày)</th><th>Buyer<br />(Khách hàng)</th><th>JO</th><th>Stock in date<br />(Ngày nhập kho)</th><th>Ex-FTY date<br />(Ngày xuất hàng)</th>
              <th>Total carton<br />(Tổng số thùng)</th><th>Sample ctn<br />({Math.round(s.sample_rate * 100)}% – Số thùng phải kiểm)</th>
              <th>Audit carton no<br />(Số thùng kiểm)</th><th>Q&apos;ty in carton<br />(SL áo trong thùng)</th><th>Actual humidity<br />(Độ ẩm thực tế) (%)</th>
              <th>Result (P/F)</th><th>QA<br />(Kí tên)</th><th>WH (Kho)<br />(Kí tên)</th><th>Security<br />(Bảo vệ)</th><th>Độ ẩm sau tái chế (%)</th><th>QR</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.plan_id} className="h-[52px] break-inside-avoid">
                  <td>{fmtDate(p.sched_date)}</td><td>{p.brand_code}</td><td className="font-semibold">{p.jo}</td>
                  <td>{fmtDate(p.stock_in_date)}</td><td>{fmtDate(p.bpo_date)}</td><td>{p.cartons}</td><td>{p.sample_cartons}</td>
                  <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                  <td className="!p-0.5"><img src={qr(p.plan_id)} alt={`QR ${p.plan_id}`} width={46} height={46} className="mx-auto" /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={16} className="py-6">Không có lô cần kiểm đến ngày {fmtDate(d)}.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 print:grid-cols-3 gap-3">
          {rows.flatMap((p) => Array.from({ length: p.sample_cartons }, (_, i) => (
            <div key={`${p.plan_id}-${i}`} className="bg-white border border-dashed border-mute p-3 flex gap-3 items-center break-inside-avoid">
              <img src={qr(p.plan_id)} alt={`QR ${p.plan_id}`} width={92} height={92} />
              <div className="text-xs leading-snug">
                <div className="font-bold text-sm">{p.jo}</div>
                <div>{p.buyer_po}</div>
                <div>{p.brand_code} · {p.plan_id}</div>
                <div className="font-semibold mt-1">Thùng mẫu {i + 1}/{p.sample_cartons}</div>
                <div>Kiểm: {fmtDate(p.sched_date)} · BPO {fmtDate(p.bpo_date)}</div>
              </div>
            </div>
          )))}
        </div>
      )}
      <p className="text-xs text-mute mt-3 no-print">QA quét QR bằng camera điện thoại (hoặc nút Quét QR ở bản điện thoại) để mở thẳng form nhập của lô.</p>
    </>
  );
}
