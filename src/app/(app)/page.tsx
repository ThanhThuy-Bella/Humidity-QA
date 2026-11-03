import Link from "next/link";
import { Card, KV, PageHeader, Priority, ResultBadge, TriggerText } from "@/components/ui";
import { HBars } from "@/components/Bars";
import { loadSettings, planDateOf } from "@/lib/settings";
import { brandStats, dueLots, evaluatedStock, historyRows, openPlans } from "@/lib/queries";
import { fmtDate, todayVN } from "@/lib/dates";
import { n0 } from "@/lib/format";
import { getProfile } from "@/lib/auth";
import ActionButton from "@/components/ActionButton";

// Trang Home (BuildHome + RefreshHome của VBA)
export default async function HomePage() {
  const s = await loadSettings();
  const today = todayVN();
  const [plans, stock, hist, me] = await Promise.all([openPlans(), evaluatedStock(s), historyRows(), getProfile()]);
  const canPlan = !!me && ["admin", "planner"].includes(me.role);
  const sentToday = s.last_email_date === today;

  const due = dueLots(plans, today);
  const late = plans.filter((p) => p.priority === "LATE").length;
  const inProg = plans.filter((p) => p.lot_result === "IN PROGRESS").length;
  const future = plans.filter((p) => p.sched_date > today && p.lot_result === "PENDING").length;
  const pass = hist.filter((h) => h.result === "PASS").length;
  const fail = hist.filter((h) => h.result === "FAIL").length;
  const done = pass + fail;
  const avgs = hist.filter((h) => h.avg_humidity !== null);
  const avg = avgs.length ? avgs.reduce((a, h) => a + Number(h.avg_humidity), 0) / avgs.length : 0;
  const maxH = hist.reduce((m, h) => Math.max(m, Number(h.max_humidity ?? 0)), 0);
  const under = hist.filter((h) => h.sampling_check === "UNDER").length;
  const brands = brandStats(stock, hist).filter((b) => b.inspected > 0);
  const m = Number(planDateOf(s).slice(5, 7));
  const season = s.rain_start <= m && m <= s.rain_end;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        sub={<>Việc kiểm ẩm hôm nay {fmtDate(today)} · báo cáo kho: {s.last_imported_file ?? "chưa nạp"} · email kế hoạch:{" "}
          {sentToday ? <span className="text-pass font-semibold">đã gửi hôm nay</span>
            : s.email_enabled ? <span>chưa gửi ({s.email_trigger === "CRON" ? "tự gửi 08:00" : "tự gửi sau khi nạp báo cáo kho"})</span>
            : <Link href="/settings" className="underline">chưa bật tự gửi</Link>}</>}
        actions={<>
          <Link href="/import" className="btn">Cập nhật báo cáo kho</Link>
          {canPlan && (
            <ActionButton url="/api/email/test" body={{ now: true }} ghost
              label={sentToday ? "Gửi lại kế hoạch hôm nay" : "Gửi kế hoạch hôm nay"} busyLabel="Đang gửi…"
              confirm={`Gửi email kế hoạch kiểm ẩm hôm nay (${due.length} lô) cho danh sách người nhận trong Cài đặt?`}
              result="email" />
          )}
          <Link href="/" className="btn-ghost">Làm mới</Link>
        </>}
      />
      <div className="grid md:grid-cols-[minmax(220px,1fr)_3fr] mb-5 rounded-md overflow-hidden border border-line">
        <div className="bg-teal text-white px-5 py-4">
          <div className="text-[44px] font-bold leading-none tabular-nums">{due.length}</div>
          <div className="text-sm mt-2">lô cần kiểm hôm nay (gồm lô trễ)</div>
        </div>
        <div className="bg-white grid grid-cols-3 divide-x divide-line">
          <div className="px-5 py-4"><div className="text-[32px] font-bold text-fail leading-none tabular-nums">{late}</div><div className="text-sm text-mute mt-2">lô trễ hạn (quá BPO date − {s.preship_deadline} ngày)</div></div>
          <div className="px-5 py-4"><div className="text-[32px] font-bold leading-none tabular-nums">{inProg}</div><div className="text-sm text-mute mt-2">lô đang kiểm dở</div></div>
          <div className="px-5 py-4"><div className="text-[32px] font-bold leading-none tabular-nums">{future}</div><div className="text-sm text-mute mt-2">lô đã xếp lịch các ngày tới</div></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card title="Tồn kho cần kiểm">
          <KV label={`Lô Grade ${s.grade_filter || "*"} trong kho`} value={n0(stock.length)} />
          <KV label="Cần kiểm trước xuất" value={stock.filter((l) => l.trigger === "PRE-SHIPMENT").length} />
          <KV label="Kiểm lại (BPO date mới)" value={stock.filter((l) => l.trigger.startsWith("RE-INSPECT")).length} />
          <KV label="Đã quá BPO date (theo dõi)" value={stock.filter((l) => l.bpo_status === "OVERDUE").length} tone="warn" />
          <KV label="Cartons trong kho" value={n0(stock.reduce((a, l) => a + l.cartons, 0))} />
        </Card>
        <Card title="Kết quả đã kiểm">
          <KV label="Lô đã kiểm" value={n0(done)} />
          <KV label="PASS" value={n0(pass)} tone="pass" />
          <KV label="FAIL" value={n0(fail)} tone="fail" />
          <KV label="Tỷ lệ đạt" value={done ? `${((pass / done) * 100).toFixed(1)}%` : "—"} />
          <KV label="Độ ẩm TB / cao nhất" value={`${avg.toFixed(2)}% / ${maxH.toFixed(1)}%`} />
          <KV label={`Lô kiểm thiếu mẫu (< ${Math.round(s.sample_rate * 100)}%)`} value={under} tone="warn" />
        </Card>
        <Card title="Chuẩn đang áp dụng">
          <KV label="PASS khi độ ẩm ≤" value={`${s.hum_limit}%`} />
          <KV label="Thùng mẫu" value={`${Math.round(s.sample_rate * 100)}%`} />
          <KV label="Số đo / thùng (áo)" value={s.readings_per_carton} />
          <KV label="ISO tồn tối thiểu (mưa / khô)" value={`${s.iso_weeks_rain} / ${s.iso_weeks_dry} tuần`} />
          <KV label="Mùa hiện tại" value={`${season ? "Mưa" : "Khô"} ${season ? s.iso_weeks_rain : s.iso_weeks_dry} tuần`} />
          <KV label="Kiểm trước BPO date" value={`${s.preship_earliest} ngày (hạn ${s.preship_deadline})`} />
        </Card>
      </div>

      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="text-lg font-semibold text-teal-dark">Lô cần kiểm hôm nay</h2>
        <span className="text-xs text-mute">Bấm vào JO để mở form nhập số đo</span>
      </div>
      <div className="card overflow-x-auto mb-8">
        <table className="tbl">
          <thead><tr>
            <th>Ngày kiểm</th><th>Ưu tiên</th><th>Brand</th><th>JO</th><th>Buyer PO</th>
            <th className="num">Thùng</th><th className="num">Mẫu</th><th className="num">Đã đo</th>
            <th>Kết quả</th><th>Vị trí</th><th>BPO date</th><th>Loại</th><th>PlanID</th><th></th>
          </tr></thead>
          <tbody>
            {due.length === 0 && <tr><td colSpan={14} className="text-mute py-6 text-center">Không còn lô nào cần kiểm đến hôm nay.</td></tr>}
            {due.map((p) => (
              <tr key={p.plan_id}>
                <td>{fmtDate(p.sched_date)}</td><td><Priority p={p.priority} /></td><td>{p.brand_code}</td>
                <td><Link className="font-semibold text-teal-dark hover:underline" href={`/inspect?lot=${encodeURIComponent(p.plan_id)}`}>{p.jo}</Link></td>
                <td>{p.buyer_po}</td><td className="num">{n0(p.cartons)}</td><td className="num">{p.sample_cartons}</td><td className="num">{p.cartons_tested}</td>
                <td><ResultBadge r={p.lot_result} /></td>
                <td className="max-w-[160px] truncate" title={p.locations ?? ""}>{p.locations}</td>
                <td>{fmtDate(p.bpo_date)}</td><td className="whitespace-nowrap"><TriggerText t={p.trigger} /></td><td className="text-mute">{p.plan_id}</td>
                <td><Link href={`/inspect?lot=${encodeURIComponent(p.plan_id)}`} className="btn h-8 px-3 whitespace-nowrap">Nhập kết quả</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold text-teal-dark mb-2">Kết quả theo khách hàng</h2>
      <div className="card p-4 grid lg:grid-cols-2 gap-6">
        <table className="tbl">
          <thead><tr><th>Brand</th><th className="num">Đã kiểm</th><th className="num">PASS</th><th className="num">FAIL</th><th className="num">Tỷ lệ</th></tr></thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.brand}><td>{b.brand}</td><td className="num">{b.inspected}</td><td className="num text-pass">{b.pass}</td>
                <td className="num text-fail">{b.fail}</td><td className="num">{b.inspected ? Math.round((b.pass / b.inspected) * 100) + "%" : ""}</td></tr>
            ))}
          </tbody>
        </table>
        <HBars rows={brands.map((b) => ({ label: b.brand, value: b.inspected, note: `${b.inspected} lô` }))} />
      </div>
    </>
  );
}
