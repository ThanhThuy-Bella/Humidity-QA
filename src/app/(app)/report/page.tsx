import { Card, ExportLink, KV, PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { historyRows } from "@/lib/queries";
import { loadSettings } from "@/lib/settings";
import { fmtDate, todayVN } from "@/lib/dates";
import { pct } from "@/lib/format";

type SP = Promise<{ from?: string; to?: string }>;

// Sheet Report (BuildReport / ExportReportPDF)
export default async function ReportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const s = await loadSettings();
  const t = todayVN();
  const from = sp.from || `${t.slice(0, 4)}-01-01`;
  const to = sp.to || t;
  const rows = (await historyRows({ from, to })).sort((a, b) => a.inspection_date.localeCompare(b.inspection_date));
  const insp = rows.filter((r) => r.result === "PASS" || r.result === "FAIL");
  const pass = insp.filter((r) => r.result === "PASS").length;
  const maxH = rows.reduce((m, r) => Math.max(m, Number(r.max_humidity ?? 0)), 0);

  return (
    <>
      <div className="no-print">
        <PageHeader title="Báo cáo kỳ" actions={<><PrintButton /><ExportLink href={`/api/export/report?from=${from}&to=${to}`} /></>} />
        <form className="flex gap-2 mb-4" method="get">
          <input type="date" name="from" defaultValue={from} className="input" aria-label="Từ ngày" />
          <input type="date" name="to" defaultValue={to} className="input" aria-label="Đến ngày" />
          <button className="btn-ghost">Xem</button>
        </form>
      </div>
      <div className="bg-white border border-line p-5 print:border-0 print:p-0">
        <h2 className="text-lg font-bold text-teal-dark">TESSELLATION HÒA BÌNH (THV) – HUMIDITY INSPECTION REPORT</h2>
        <p className="text-sm text-mute mb-3">Period: {fmtDate(from, "dmmy")} → {fmtDate(to, "dmmy")} | Humidity ≤ {s.hum_limit}% = PASS | Sampling: ROUNDUP(Cartons×{Math.round(s.sample_rate * 100)}%,0) thùng × {s.readings_per_carton} điểm đo</p>
        <Card className="max-w-sm mb-4 !p-3">
          <KV label="Lots inspected" value={insp.length} />
          <KV label="PASS" value={pass} tone="pass" />
          <KV label="FAIL" value={insp.length - pass} tone="fail" />
          <KV label="Pass rate" value={insp.length ? `${((pass / insp.length) * 100).toFixed(1)}%` : "—"} />
          <KV label="Under-sampled lots" value={rows.filter((r) => r.sampling_check === "UNDER").length} tone="warn" />
          <KV label="Max humidity" value={`${maxH.toFixed(1)}%`} />
        </Card>
        <div className="overflow-x-auto">
          <table className="tbl text-xs">
            <thead><tr><th>Date</th><th>Buyer</th><th>JO</th><th>Color</th><th>BPO</th><th>Stock in</th><th>Ex-FTY</th><th className="num">Total ctn</th><th className="num">Sample req.</th>
              <th>Audit carton no</th><th>Q&apos;ty in ctn</th><th>Actual humidity (%)</th><th className="num">Max %</th><th>P/F</th><th>Sampling</th><th>QA</th><th className="num">Rework %</th></tr></thead>
            <tbody>{rows.map((h) => (
              <tr key={h.plan_id}>
                <td>{fmtDate(h.inspection_date)}</td><td>{h.brand_code}</td><td>{h.jo}</td><td>{h.color}</td><td>{h.bpo}</td>
                <td>{fmtDate(h.stock_in_date)}</td><td>{fmtDate(h.exfty_date)}</td><td className="num">{h.total_cartons}</td><td className="num">{h.sample_required}</td>
                <td>{h.audit_carton_no}</td><td>{h.qty_in_carton}</td><td>{h.readings}</td><td className="num">{pct(h.max_humidity)}</td>
                <td className={h.result === "FAIL" ? "text-fail font-bold" : h.result === "PASS" ? "text-pass font-bold" : ""}>{h.result === "PASS" ? "P" : h.result === "FAIL" ? "F" : h.result}</td>
                <td>{h.sampling_check}</td><td>{h.qa}</td><td className="num">{pct(h.rework_humidity)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 mt-10 text-sm font-bold">
          <div>Prepared by (QA)</div><div>Checked by (QA Manager)</div><div>Approved by (Factory Manager)</div>
        </div>
      </div>
    </>
  );
}
