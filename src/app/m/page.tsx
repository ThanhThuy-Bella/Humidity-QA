import Link from "next/link";
import { dueLots, openPlans } from "@/lib/queries";
import { fmtDate, todayVN } from "@/lib/dates";
import { brandTone, lotStatus, STATUS } from "@/lib/mobileUi";
import type { PlanView } from "@/lib/types";

type SP = Promise<{ q?: string; khu?: string }>;

const areasOf = (p: PlanView) => Object.keys(p.location_pallets ?? {}).filter((k) => k !== "(trống)");

// Danh sách lô cần kiểm cho công nhân: trễ hạn lên đầu, lọc theo khu kho (v1.5: giao diện nhiều màu)
export default async function MobileHome({ searchParams }: { searchParams: SP }) {
  const { q = "", khu = "" } = await searchParams;
  const t = todayVN();
  const plans = await openPlans();
  const allDue = dueLots(plans, t);
  const areas = Array.from(new Set(allDue.flatMap(areasOf))).sort();
  const kw = q.trim().toUpperCase();
  const due = allDue
    .filter((p) => !khu || areasOf(p).includes(khu))
    .filter((p) => !kw || p.jo.toUpperCase().includes(kw) || p.buyer_po.toUpperCase().includes(kw) || p.plan_id.includes(kw))
    // lô đang đo dở lên trên lô chưa đo (trong cùng mức ưu tiên) để làm cho xong
    .sort((a, b) => (a.priority === "LATE" ? 0 : 1) - (b.priority === "LATE" ? 0 : 1) || b.cartons_tested - a.cartons_tested);
  const later = plans.filter((p) => p.sched_date > t && p.lot_result === "PENDING").slice(0, 10);
  const qs = (k: string) => `/m?${new URLSearchParams({ ...(q ? { q } : {}), ...(k ? { khu: k } : {}) })}`;

  const late = allDue.filter((p) => p.priority === "LATE").length;
  const doing = allDue.filter((p) => lotStatus(p) === "doing").length;
  const todo = allDue.filter((p) => lotStatus(p) === "todo").length;
  const cartonsLeft = allDue.reduce((a, p) => a + Math.max(0, p.sample_cartons - p.cartons_tested), 0);

  return (
    <>
      {/* tổng quan hôm nay */}
      <section className="rounded-2xl bg-teal text-white p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm opacity-90">Hôm nay {fmtDate(t, "dm")}</div>
            <div className="text-[44px] font-bold leading-none tabular-nums mt-1">{allDue.length}</div>
            <div className="text-base font-semibold">lô cần đo ẩm</div>
          </div>
          <div className="text-right">
            <div className="text-[28px] font-bold leading-none tabular-nums">{cartonsLeft}</div>
            <div className="text-sm opacity-90">thùng mẫu còn lại</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-xl bg-[#DC2626] px-2.5 py-2">
            <div className="text-2xl font-bold tabular-nums leading-none">{late}</div>
            <div className="text-xs font-semibold mt-1">Trễ hạn</div>
          </div>
          <div className="rounded-xl bg-[#FACC15] text-[#422006] px-2.5 py-2">
            <div className="text-2xl font-bold tabular-nums leading-none">{doing}</div>
            <div className="text-xs font-semibold mt-1">Đang đo dở</div>
          </div>
          <div className="rounded-xl bg-white text-[#075985] px-2.5 py-2">
            <div className="text-2xl font-bold tabular-nums leading-none">{todo}</div>
            <div className="text-xs font-semibold mt-1">Chưa đo</div>
          </div>
        </div>
      </section>

      {/* lọc khu + tìm */}
      {areas.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pt-3 pb-1" aria-label="Lọc theo khu">
          <Link href={qs("")} className={`shrink-0 h-11 px-4 rounded-full flex items-center font-semibold ${!khu ? "bg-teal-dark text-white" : "bg-white text-teal-dark border-2 border-[#BAE6FD]"}`}>Tất cả</Link>
          {areas.map((a) => (
            <Link key={a} href={qs(a)} className={`shrink-0 h-11 px-4 rounded-full flex items-center font-semibold ${khu === a ? "bg-teal-dark text-white" : "bg-white text-teal-dark border-2 border-[#BAE6FD]"}`}>Khu {a}</Link>
          ))}
        </div>
      )}
      <form method="get" className="mt-3 mb-3 flex gap-2">
        {khu && <input type="hidden" name="khu" value={khu} />}
        <input name="q" defaultValue={q} placeholder="Tìm số JO hoặc PO" className="input h-12 flex-1 text-base rounded-xl border-2 border-[#BAE6FD]" aria-label="Tìm lô" inputMode="search" />
        {q && <Link href={qs(khu)} className="btn-ghost h-12 rounded-xl">Xóa</Link>}
      </form>

      {/* danh sách lô – bấm vào để nhập */}
      <ul className="space-y-3">
        {due.map((p) => {
          const st = STATUS[lotStatus(p)];
          const br = brandTone(p.brand_code);
          const isLate = p.priority === "LATE";
          const pct = Math.min(100, (p.cartons_tested / Math.max(1, p.sample_cartons)) * 100);
          return (
            <li key={p.plan_id}>
              <Link href={`/m/lot/${encodeURIComponent(p.plan_id)}`}
                className={`block bg-white rounded-2xl p-4 shadow-sm active:scale-[0.99] motion-reduce:active:scale-100 transition-transform ${isLate ? "ring-2 ring-[#DC2626]" : "ring-1 ring-[#DCE6EC]"}`}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: br.bg, color: br.fg }}>
                    {p.brand_code.slice(0, 3)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold text-ink break-all leading-tight">{p.jo}</div>
                    <div className="text-sm text-mute mt-0.5 truncate">{p.customer || p.brand_code} · PO {p.buyer_po}</div>
                    {p.color && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[#FFF7ED] text-[#9A3412] px-2 py-0.5 text-sm font-semibold max-w-full">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0"><path d="M20.4 4.6 16 2l-4 2-4-2-4.4 2.6L5 10h2v12h10V10h2z" /></svg>
                        <span className="truncate">Màu {p.color}</span>
                      </div>
                    )}
                  </div>
                  {isLate && <span className="shrink-0 rounded-full bg-[#DC2626] text-white text-xs font-bold px-2.5 py-1">Trễ hạn</span>}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: st.bg }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: st.bar }} />
                  </div>
                  <span className="text-base font-bold tabular-nums shrink-0">{p.cartons_tested}<span className="text-mute font-semibold">/{p.sample_cartons} thùng</span></span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="rounded-full text-xs font-bold px-2.5 py-1" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    <span className="rounded-full text-xs font-semibold px-2.5 py-1 bg-[#F1F5F9] text-[#334155] truncate">Khu {areasOf(p).join(", ") || "—"}</span>
                  </div>
                  <span className="shrink-0 h-10 px-4 rounded-xl bg-teal text-white font-bold flex items-center gap-1">
                    Nhập
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
        {due.length === 0 && (
          <li className="rounded-2xl bg-[#DCFCE7] text-[#166534] text-center py-10 px-4 font-semibold">
            {kw || khu ? "Không có lô nào khớp." : "Hôm nay đã đo xong tất cả các lô."}
          </li>
        )}
      </ul>

      {later.length > 0 && !kw && !khu && (
        <>
          <h2 className="font-bold text-teal-dark mt-6 mb-2">Các ngày tới</h2>
          <ul className="bg-white rounded-2xl ring-1 ring-[#DCE6EC] divide-y divide-[#EDF2F5]">
            {later.map((p) => {
              const br = brandTone(p.brand_code);
              return (
                <li key={p.plan_id} className="p-3 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0" style={{ background: br.bg, color: br.fg }}>{p.brand_code.slice(0, 3)}</span>
                    <b className="shrink-0">{fmtDate(p.sched_date, "dm")}</b>
                    <span className="truncate">{p.jo}{p.color ? ` · ${p.color}` : ""}</span>
                  </span>
                  <span className="text-mute shrink-0">{p.sample_cartons} thùng</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
