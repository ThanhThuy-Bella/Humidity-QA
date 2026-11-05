import { Card, KV, PageHeader } from "@/components/ui";
import { HBars, MonthColumns } from "@/components/Bars";
import { brandStats, capaRows, evaluatedStock, historyRows, openPlans } from "@/lib/queries";
import { loadSettings, planDateOf } from "@/lib/settings";
import { fmtDate } from "@/lib/dates";
import { n0 } from "@/lib/format";

// Sheet Dashboard + Pivot (RefreshDashboard / BuildPivots)
export default async function DashboardPage() {
  const s = await loadSettings();
  const [stock, hist, plans, capas] = await Promise.all([evaluatedStock(s), historyRows(), openPlans(), capaRows()]);
  const brands = brandStats(stock, hist);
  const pd = planDateOf(s);
  const m = Number(pd.slice(5, 7));
  const rainy = m >= s.rain_start && m <= s.rain_end;

  const byBrand = new Map<string, { PASS: number; FAIL: number; "NO DATA": number; OK: number; UNDER: number }>();
  const byMonth = new Map<string, { s: number; n: number; max: number; lots: number }>();
  for (const h of hist) {
    const b = h.brand_code ?? "?";
    if (!byBrand.has(b)) byBrand.set(b, { PASS: 0, FAIL: 0, "NO DATA": 0, OK: 0, UNDER: 0 });
    const x = byBrand.get(b)!;
    if (h.result in x) x[h.result as "PASS"]++;
    if (h.sampling_check === "OK") x.OK++;
    if (h.sampling_check === "UNDER") x.UNDER++;
    if (h.result === "NO DATA") continue;
    const k = h.inspection_date.slice(0, 7);
    const mm = byMonth.get(k) ?? { s: 0, n: 0, max: 0, lots: 0 };
    mm.lots++;
    if (h.avg_humidity !== null) { mm.s += Number(h.avg_humidity); mm.n++; }
    mm.max = Math.max(mm.max, Number(h.max_humidity ?? 0));
    byMonth.set(k, mm);
  }
  const months = Array.from(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, v]) => ({ month, avg: v.n ? v.s / v.n : 0, max: v.max, lots: v.lots }));
  const openCapa = capas.filter((c) => !["CLOSED", "CANCELLED"].includes(c.status)).length;

  return (
    <>
      <PageHeader title="Dashboard"
        sub={`Plan date: ${fmtDate(pd, "dmmy")} | Season: ${rainy ? "Rainy" : "Dry"} (${rainy ? s.iso_weeks_rain : s.iso_weeks_dry} wks) | Limit ≤${s.hum_limit}% | Kiểm trước BPO date ${s.preship_earliest} ngày (hạn ${s.preship_deadline})`} />
      <div className="grid lg:grid-cols-[280px_1fr] gap-4 mb-4">
        <Card title="KPI">
          <KV label="Lô tồn (Grade A, store tính)" value={n0(stock.length)} />
          <KV label="Thùng tồn" value={n0(stock.reduce((a, l) => a + l.cartons, 0))} />
          <KV label="Lô cần kiểm (Trigger)" value={stock.filter((l) => l.trigger).length} />
          <KV label="Kế hoạch đang mở" value={plans.length} />
          <KV label="Trễ hạn" value={plans.filter((p) => p.priority === "LATE").length} tone="fail" />
        </Card>
        <Card title="Theo brand (top 14 theo số thùng tồn)">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Brand</th><th className="num">Lô tồn</th><th className="num">Cần kiểm</th><th className="num">Đã kiểm</th><th className="num">PASS</th><th className="num">FAIL</th><th className="num">Thiếu mẫu</th><th className="num">Ẩm TB</th></tr></thead>
              <tbody>{brands.map((b) => (
                <tr key={b.brand}><td className="font-medium">{b.brand}</td><td className="num">{b.lotsInStock}</td><td className="num">{b.dueNow}</td><td className="num">{b.inspected}</td>
                  <td className="num text-pass">{b.pass}</td><td className="num text-fail">{b.fail}</td><td className="num text-warn">{b.under}</td><td className="num">{b.avgHum ? b.avgHum.toFixed(2) + "%" : ""}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Độ ẩm trung bình / cao nhất theo tháng"><MonthColumns data={months} limit={s.hum_limit} /></Card>
        <Card title="Lô theo Brand × Kết quả">
          <table className="tbl mb-4">
            <thead><tr><th>Brand</th><th className="num">PASS</th><th className="num">FAIL</th><th className="num">No data</th><th className="num">Đủ mẫu</th><th className="num">Thiếu mẫu</th></tr></thead>
            <tbody>{Array.from(byBrand).sort((a, b) => (b[1].PASS + b[1].FAIL) - (a[1].PASS + a[1].FAIL)).map(([b, x]) => (
              <tr key={b}><td>{b}</td><td className="num">{x.PASS}</td><td className="num">{x.FAIL}</td><td className="num">{x["NO DATA"]}</td><td className="num">{x.OK}</td><td className="num">{x.UNDER}</td></tr>
            ))}</tbody>
          </table>
          <HBars rows={brands.filter((b) => b.cartons).map((b) => ({ label: b.brand, value: b.cartons, note: n0(b.cartons) }))} />
          <p className="text-xs text-mute mt-1">Thanh = số thùng tồn theo brand</p>
        </Card>
      </div>
    </>
  );
}
