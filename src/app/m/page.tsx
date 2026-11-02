import Link from "next/link";
import { dueLots, openPlans } from "@/lib/queries";
import { fmtDate, todayVN } from "@/lib/dates";
import type { PlanView } from "@/lib/types";

type SP = Promise<{ q?: string; khu?: string }>;

const areasOf = (p: PlanView) => Object.keys(p.location_pallets ?? {}).filter((k) => k !== "(trống)");
const state = (p: PlanView) =>
  p.kind === "REWORK" ? { t: "Kiểm lại sau tái chế", c: "text-fail" }
  : p.lot_result === "FAIL" ? { t: "Có thùng không đạt", c: "text-fail" }
  : p.cartons_tested > 0 || p.lot_result === "IN PROGRESS" ? { t: "Đang đo dở", c: "text-teal-dark" }
  : { t: "Chưa đo", c: "text-mute" };

// Danh sách lô cần kiểm cho công nhân: trễ hạn lên đầu, lọc theo khu kho
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

  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[40px] font-bold leading-none tabular-nums text-teal-dark">{allDue.length}</div>
          <div className="text-base">lô cần đo ẩm hôm nay {fmtDate(t, "dm")}</div>
        </div>
        <Link href="/m/scan" className="btn h-14 px-6 text-lg rounded-xl">Quét QR</Link>
      </div>

      {areas.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-1" aria-label="Lọc theo khu">
          <Link href={qs("")} className={`shrink-0 h-11 px-4 rounded-full flex items-center font-semibold border-2 ${!khu ? "bg-teal border-teal text-white" : "bg-white border-line"}`}>Tất cả</Link>
          {areas.map((a) => (
            <Link key={a} href={qs(a)} className={`shrink-0 h-11 px-4 rounded-full flex items-center font-semibold border-2 ${khu === a ? "bg-teal border-teal text-white" : "bg-white border-line"}`}>Khu {a}</Link>
          ))}
        </div>
      )}
      <form method="get" className="mb-3 flex gap-2">
        {khu && <input type="hidden" name="khu" value={khu} />}
        <input name="q" defaultValue={q} placeholder="Tìm số JO hoặc PO" className="input h-12 flex-1 text-base" aria-label="Tìm lô" inputMode="search" />
        {q && <Link href={qs(khu)} className="btn-ghost h-12">Xóa</Link>}
      </form>

      <ul className="space-y-2.5">
        {due.map((p) => {
          const st = state(p);
          const pct = Math.min(100, (p.cartons_tested / Math.max(1, p.sample_cartons)) * 100);
          return (
            <li key={p.plan_id}>
              <Link href={`/m/lot/${encodeURIComponent(p.plan_id)}`}
                className={`block bg-white rounded-xl border-2 p-4 active:bg-teal-xl ${p.priority === "LATE" ? "border-fail/60" : "border-line"}`}>
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xl font-bold text-teal-dark break-all leading-tight">{p.jo}</div>
                    <div className="text-sm text-mute mt-0.5">{p.brand_code} – PO {p.buyer_po}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold tabular-nums leading-none">{p.cartons_tested}<span className="text-base text-mute">/{p.sample_cartons}</span></div>
                    <div className="text-xs text-mute">thùng</div>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-[#E7EDF0] rounded-full overflow-hidden">
                  <div className={`h-full ${p.lot_result === "FAIL" ? "bg-fail" : "bg-teal"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between gap-2 text-sm">
                  <span className={`font-semibold ${st.c}`}>{p.priority === "LATE" ? <span className="text-fail">Trễ hạn · </span> : null}{st.t}</span>
                  <span className="text-mute truncate">Khu {areasOf(p).join(", ") || "—"}</span>
                </div>
              </Link>
            </li>
          );
        })}
        {due.length === 0 && <li className="text-center text-mute py-10 text-base">{kw || khu ? "Không có lô nào khớp." : "Hôm nay không còn lô nào cần đo."}</li>}
      </ul>

      {later.length > 0 && !kw && !khu && (
        <>
          <h2 className="font-semibold text-mute mt-6 mb-2">Các ngày tới</h2>
          <ul className="bg-white border border-line rounded-xl divide-y divide-line">
            {later.map((p) => (
              <li key={p.plan_id} className="p-3 flex justify-between gap-2 text-sm">
                <span className="truncate"><b>{fmtDate(p.sched_date, "dm")}</b> {p.jo}</span><span className="text-mute shrink-0">{p.sample_cartons} thùng</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
