"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PlanView, ReadingRow } from "@/lib/types";
import ReworkButton from "./ReworkButton";

/**
 * FORM NHẬP CHO CÔNG NHÂN – đi từng thùng mẫu, mỗi màn hình một việc:
 *   1. Số thùng + SL áo   2. Đo 3 áo   → Lưu → thùng tiếp   (v1.7: bỏ bước chọn vị trí / pallet)
 * Bàn phím số trên màn hình (bấm được khi đeo găng, có sẵn dấu phẩy).
 * Mỗi thùng lưu ngay khi bấm "Lưu thùng"; mất sóng → xếp hàng chờ gửi (lưu trên máy), tự gửi khi có mạng.
 * Không hiện các trường của QA (tái chế, ghi chú) → không ghi đè dữ liệu QA.
 */
type Row = { sampleNo: number; location: string; pallet: string; carton: string; qty: string; r: [string, string, string] };
type Step = "carton" | "read" | "done";
type Field = "carton" | "qty" | 0 | 1 | 2;

const s2 = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (s: string): number | null => {
  const t = s.replace(",", ".");
  if (!t || t.endsWith(".")) return t.endsWith(".") && t.length > 1 ? Number(t.slice(0, -1)) : null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const show = (s: string) => s.replace(".", ",");
const done = (r: Row) => r.r.every((x) => num(x) !== null);
const maxOf = (r: Row) => { const v = r.r.map(num).filter((x): x is number => x !== null); return v.length ? Math.max(...v) : null; };
const qKey = (id: string) => `hm-wq:${id}`;

export default function WorkerEntry({ plan, readings, limit, today, defaultName }: {
  plan: PlanView; readings: ReadingRow[]; limit: number; today: string; defaultName: string;
}) {
  const initial = useMemo<Row[]>(() => [...readings].sort((a, b) => a.sample_no - b.sample_no).map((x) => ({
    sampleNo: x.sample_no, location: s2(x.location), pallet: s2(x.pallet), carton: s2(x.audit_carton_no), qty: s2(x.qty_in_carton),
    r: [s2(x.r1), s2(x.r2), s2(x.r3)],
  })), [readings]);

  const [rows, setRows] = useState<Row[]>(initial);
  const [queue, setQueue] = useState<Record<number, Row>>({});
  const [worker, setWorker] = useState(defaultName);
  const [cur, setCur] = useState(() => Math.max(0, initial.findIndex((r) => !done(r))));
  const startStep = (r: Row | undefined): Step => (!r ? "done" : done(r) ? "read" : !r.carton ? "carton" : "read");
  const [step, setStep] = useState<Step>(() => (initial.every(done) ? "done" : startStep(initial[Math.max(0, initial.findIndex((r) => !done(r)))])));
  const [field, setField] = useState<Field>("carton");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const [result, setResult] = useState<{ res: string } | null>(null);
  const [err, setErr] = useState("");
  const queueRef = useRef(queue);
  queueRef.current = queue;

  // tên người đo nhớ trên máy (nhiều công nhân dùng chung 1 điện thoại)
  useEffect(() => {
    try { const n = localStorage.getItem("hm-worker"); if (n) setWorker(n); } catch { /* */ }
    try {
      const q = JSON.parse(localStorage.getItem(qKey(plan.plan_id)) ?? "{}") as Record<number, Row>;
      if (Object.keys(q).length) {
        setQueue(q);
        setRows((rs) => rs.map((r) => q[r.sampleNo] ?? r));
      }
    } catch { /* */ }
  }, [plan.plan_id]);
  useEffect(() => {
    try {
      if (Object.keys(queue).length) localStorage.setItem(qKey(plan.plan_id), JSON.stringify(queue));
      else localStorage.removeItem(qKey(plan.plan_id));
    } catch { /* */ }
  }, [queue, plan.plan_id]);

  const send = useCallback(async (batch: Row[]) => {
    const res = await fetch("/api/inspect/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: plan.plan_id, inspectionDate: today, qaName: worker || undefined,
        rows: batch.map((r) => ({ sampleNo: r.sampleNo, location: r.location, pallet: r.pallet, auditCartonNo: r.carton, qtyInCarton: r.qty, r1: r.r[0], r2: r.r[1], r3: r.r[2] })),
      }),
    });
    const d = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) throw Object.assign(new Error("Hết phiên đăng nhập – số đo vẫn giữ trên máy. Đăng nhập lại rồi mở lại lô."), { keep: true });
    if (!res.ok) throw Object.assign(new Error(d.error || res.statusText), { keep: false });
    if (d.status === "ARCHIVED") { setResult({ res: d.result }); setStep("done"); }
    return d;
  }, [plan.plan_id, today, worker]);

  const flush = useCallback(async () => {
    const q = Object.values(queueRef.current);
    if (!q.length || sending) return;
    setSending(true);
    try {
      await send(q);
      setQueue((cur) => { const n = { ...cur }; q.forEach((r) => { if (n[r.sampleNo] === r) delete n[r.sampleNo]; }); return n; });
      setErr("");
    } catch (e) {
      if (!(e instanceof TypeError)) setErr((e as Error).message);
    } finally { setSending(false); }
  }, [send, sending]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

  const row = rows[cur];
  const set = (patch: Partial<Row>) => setRows((rs) => rs.map((r, i) => (i === cur ? { ...r, ...patch } : r)));
  const setReading = (k: 0 | 1 | 2, v: string) => set({ r: row.r.map((x, i) => (i === k ? v : x)) as Row["r"] });

  function goto(i: number) {
    setErr("");
    setCur(i);
    const s = startStep(rows[i]);
    setStep(s === "done" ? "read" : s);
    const f = rows[i].r.findIndex((x) => num(x) === null);
    setField(s === "read" || s === "done" ? ((f < 0 ? 0 : f) as Field) : "carton");
    window.scrollTo({ top: 0 });
  }

  async function saveCarton() {
    if (!done(row)) return;
    const snapshot = { ...row, r: [...row.r] as Row["r"] };
    const nextIdx = rows.findIndex((r, i) => i !== cur && !done(r));
    // chuyển thùng ngay (không bắt công nhân đứng chờ mạng)
    if (nextIdx >= 0) goto(nextIdx); else setStep("done");
    setQueue((q) => ({ ...q, [snapshot.sampleNo]: snapshot }));
    setSending(true);
    try {
      const all = { ...queueRef.current, [snapshot.sampleNo]: snapshot };
      await send(Object.values(all));
      setQueue((q) => { const n = { ...q }; Object.values(all).forEach((r) => { if (n[r.sampleNo] === r) delete n[r.sampleNo]; }); return n; });
      setErr("");
    } catch (e) {
      if (!(e instanceof TypeError)) setErr((e as Error).message);
    } finally { setSending(false); }
  }

  // ---- bàn phím số trên màn hình
  function press(key: string) {
    if (!row) return;
    const isReading = typeof field === "number";
    const cur = isReading ? row.r[field as 0 | 1 | 2] : field === "carton" ? row.carton : row.qty;
    let v = cur;
    if (key === "⌫") v = cur.slice(0, -1);
    else if (key === ",") { if (!isReading || cur.includes(".") || !cur) return; v = cur + "."; }
    else {
      if (isReading) {
        const [a, b] = cur.split(".");
        if (b !== undefined ? b.length >= 2 : a.length >= 2) return;
      } else if (cur.length >= 8) return;
      v = cur + key;
    }
    if (isReading) {
      setReading(field as 0 | 1 | 2, v);
      // gõ xong 1 chữ số thập phân → tự sang áo tiếp
      if (/^\d+\.\d$/.test(v) && (field as number) < 2) setTimeout(() => setField(((field as number) + 1) as Field), 120);
    } else if (field === "carton") set({ carton: v }); else set({ qty: v });
  }

  const tested = rows.filter(done).length;
  const failCartons = rows.filter((r) => (maxOf(r) ?? 0) > limit).length;
  const pending = Object.keys(queue).length;

  // ===================================================================== giao diện
  return (
    <div className="-mx-3 -mt-3 min-h-[calc(100vh-56px)] flex flex-col bg-page">
      {/* đầu: lô + dãy thùng */}
      <div className="bg-teal text-white px-4 pt-3 pb-3 shadow-sm">
        <Link href="/m" className="inline-flex items-center gap-1 text-sm font-semibold text-white/90 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
          Danh sách lô
        </Link>
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-[22px] leading-tight font-bold break-all">{plan.jo}</div>
            <div className="text-sm text-white/90">{plan.brand_code} – PO {plan.buyer_po}</div>
            {plan.color && <div className="mt-1 inline-block rounded-lg bg-white text-[#9A3412] px-2 py-0.5 text-sm font-bold">Màu {plan.color}</div>}
          </div>
          <div className="text-right shrink-0 rounded-xl bg-white/15 px-3 py-1.5">
            <div className="text-[22px] font-bold tabular-nums leading-tight">{tested}<span className="text-white/80 text-base">/{rows.length}</span></div>
            <div className="text-xs text-white/90">thùng xong</div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1" role="tablist" aria-label="Thùng mẫu">
          {rows.map((r, i) => {
            const m = maxOf(r);
            const c = m !== null && m > limit && done(r) ? "bg-[#DC2626] text-white" : done(r) ? "bg-[#16A34A] text-white" : i === cur && step !== "done" ? "bg-[#FACC15] text-[#422006]" : "bg-white/20 text-white";
            return (
              <button key={r.sampleNo} role="tab" aria-selected={i === cur} onClick={() => goto(i)}
                className={`shrink-0 min-w-11 h-11 rounded-lg text-base font-bold ${c} ${i === cur && step !== "done" ? "ring-2 ring-white" : ""}`}>
                {r.sampleNo}{queue[r.sampleNo] && <span className="sr-only"> chưa gửi</span>}
              </button>
            );
          })}
        </div>
        {plan.kind === "REWORK" && (
          <div className="mt-2 rounded-lg bg-[#EDE9FE] text-[#5B21B6] px-3 py-2 text-sm font-semibold">
            Kiểm lại sau tái chế – lô gốc {plan.parent_plan_id}. Đo lại toàn bộ {rows.length} thùng mẫu.
          </div>
        )}
        {(!online || pending > 0) && (
          <div className="mt-2 rounded-lg bg-[#FEF3C7] text-[#92400E] px-3 py-1.5 text-sm font-semibold" role="status">
            {!online ? "Mất sóng – cứ đo tiếp, " : ""}{pending ? `${pending} thùng chờ gửi${online ? " – đang gửi…" : ""}` : ""}
          </div>
        )}
        {err && <div className="mt-2 rounded-lg bg-[#FEE2E2] text-[#991B1B] px-3 py-1.5 text-sm font-semibold" role="alert">{err}</div>}
      </div>

      {step === "done" ? (
        <DoneScreen plan={plan} result={result} pending={pending} failCartons={failCartons} total={rows.length} tested={tested} onRetry={flush} />
      ) : (
        <>
          {/* các bước */}
          <ol className="flex text-sm font-semibold border-b border-line bg-white" aria-label="Các bước">
            {([["carton", "Số thùng"], ["read", "Đo 3 áo"]] as const).map(([k, l], i) => (
              <li key={k} className="flex-1">
                <button onClick={() => { setStep(k); setField(k === "read" ? 0 : "carton"); }} className={`w-full py-3 border-b-4 ${step === k ? "border-[#FACC15] text-teal-dark bg-[#F0F9FF]" : "border-transparent text-mute"}`}>
                  {i + 1}. {l}
                </button>
              </li>
            ))}
          </ol>

          <div className="flex-1 px-4 py-4">
            <div className="text-lg font-bold mb-3">Thùng mẫu {row.sampleNo} / {rows.length}</div>

            {step === "carton" && (
              <div className="grid grid-cols-2 gap-3">
                <Display label="Số thùng" value={row.carton} active={field === "carton"} onClick={() => setField("carton")} />
                <Display label="Số áo trong thùng" value={row.qty} active={field === "qty"} onClick={() => setField("qty")} />
              </div>
            )}

            {step === "read" && (
              <div>
                <div className="grid grid-cols-3 gap-2">
                  {([0, 1, 2] as const).map((k) => (
                    <Gauge key={k} label={`Áo ${k + 1}`} value={row.r[k]} limit={limit} active={field === k} onClick={() => setField(k)} />
                  ))}
                </div>
                <Verdict row={row} limit={limit} />
              </div>
            )}
          </div>

          {/* bàn phím + nút chính, dính đáy màn hình */}
          <div className="sticky bottom-0 bg-white border-t border-line px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
            <Keypad onKey={press} decimal={step === "read"} />
            <PrimaryButton step={step} row={row} limit={limit}
              onNext={() => {
                if (step === "carton") { if (field === "carton" && !row.qty) setField("qty"); else { setStep("read"); setField(0); } }
                else saveCarton();
              }} />
            <div className="flex justify-between items-center mt-2 text-sm">
              <label className="flex items-center gap-1.5 text-mute">Người đo
                <input value={worker} onChange={(e) => { setWorker(e.target.value); try { localStorage.setItem("hm-worker", e.target.value); } catch { /* */ } }}
                  className="border-b border-line bg-transparent w-32 text-ink font-semibold focus:outline-none focus:border-teal" aria-label="Tên người đo" />
              </label>
              <Link href={`/m/lot/${encodeURIComponent(plan.plan_id)}?full=1`} className="text-teal-dark underline">Chế độ QA</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- mảnh giao diện
function Display({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left rounded-xl border-2 px-3 py-2 bg-white ${active ? "border-teal ring-2 ring-teal/30" : "border-line"}`}>
      <div className="text-sm text-mute">{label}</div>
      <div className="text-[34px] font-bold tabular-nums leading-tight min-h-[42px]">{value || <span className="text-line">–</span>}</div>
    </button>
  );
}

/** Ô số đo dạng ống đo ẩm: cột màu dâng theo giá trị (thang 0–10%), vạch đỏ ở ngưỡng */
function Gauge({ label, value, limit, active, onClick }: { label: string; value: string; limit: number; active: boolean; onClick: () => void }) {
  const v = num(value);
  const over = v !== null && v > limit;
  const odd = v !== null && v > 15;
  const h = v === null ? 0 : Math.min(100, (v / 10) * 100);
  return (
    <button onClick={onClick} aria-label={`${label}: ${value ? show(value) + "%" : "chưa đo"}`}
      className={`relative h-44 rounded-xl overflow-hidden border-2 bg-white text-left ${active ? "border-teal ring-2 ring-teal/30" : over ? "border-fail" : "border-line"}`}>
      <div className={`absolute inset-x-0 bottom-0 transition-[height] duration-300 motion-reduce:transition-none ${over ? "bg-fail/25" : "bg-teal/20"}`} style={{ height: `${h}%` }} />
      <div className="absolute inset-x-0 border-t-2 border-dashed border-fail/70" style={{ bottom: `${(limit / 10) * 100}%` }} aria-hidden />
      <div className="relative p-2.5 flex flex-col h-full">
        <span className="text-sm font-semibold text-mute">{label}</span>
        <span className={`mt-auto text-[38px] font-bold tabular-nums leading-none ${over ? "text-fail" : "text-ink"}`}>
          {value ? show(value) : <span className="text-line">–</span>}
          {value && <span className="text-lg font-semibold">%</span>}
        </span>
        {odd && <span className="text-xs font-semibold text-warn mt-1">Gõ nhầm?</span>}
      </div>
    </button>
  );
}

function Verdict({ row, limit }: { row: Row; limit: number }) {
  const m = maxOf(row);
  if (m === null) return <p className="text-mute mt-3">Đo 3 cái áo trong thùng, gõ số trên máy đo. Ngưỡng đạt: ≤ {show(String(limit))}%.</p>;
  if (!done(row)) return <p className="text-mute mt-3">Còn {row.r.filter((x) => num(x) === null).length} áo chưa đo.</p>;
  const fail = m > limit;
  return (
    <div className={`mt-3 rounded-xl p-3 text-center ${fail ? "bg-fail text-white" : "bg-pass text-white"}`} role="status">
      <div className="text-2xl font-bold">{fail ? "KHÔNG ĐẠT" : "ĐẠT"}</div>
      <div className="text-sm opacity-90">Cao nhất {show(String(m))}% {fail ? `> ${show(String(limit))}% – báo QA` : `≤ ${show(String(limit))}%`}</div>
    </div>
  );
}

function Keypad({ onKey, decimal }: { onKey: (k: string) => void; decimal: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "," : "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-1.5 mb-2 select-none">
      {keys.map((k, i) => k ? (
        <button key={i} onClick={() => onKey(k)} aria-label={k === "⌫" ? "Xóa" : k === "," ? "Dấu phẩy" : k}
          className={`h-14 rounded-lg text-[26px] font-semibold active:scale-95 motion-reduce:active:scale-100 ${k === "⌫" ? "bg-[#E7EDF0] text-mute" : "bg-[#F4F7F8] text-ink"}`}>{k}</button>
      ) : <span key={i} />)}
    </div>
  );
}

function PrimaryButton({ step, row, limit, onNext }: { step: Step; row: Row; limit: number; onNext: () => void }) {
  const ready = done(row);
  const m = maxOf(row);
  const label = step === "carton" ? "Tiếp – đo áo" : ready ? `Lưu thùng ${row.sampleNo}` : "Đo đủ 3 áo để lưu";
  const tone = step === "read" && ready && m !== null && m > limit ? "bg-fail" : "bg-teal";
  return (
    <button onClick={onNext} disabled={step === "read" && !ready}
      className={`w-full h-14 rounded-xl text-white text-lg font-bold ${tone} disabled:bg-[#C9D3D9] active:opacity-90`}>
      {label}
    </button>
  );
}

function DoneScreen({ plan, result, pending, failCartons, total, tested, onRetry }: {
  plan: PlanView; result: { res: string } | null; pending: number; failCartons: number; total: number; tested: number; onRetry: () => void;
}) {
  const fail = result ? result.res === "FAIL" : failCartons > 0;
  const rework = plan.kind === "REWORK";
  const rootId = rework ? plan.parent_plan_id! : plan.plan_id;
  return (
    <div className="flex-1 px-4 py-6 flex flex-col">
      <div className={`rounded-2xl p-6 text-center text-white ${result ? (fail ? "bg-fail" : "bg-pass") : "bg-teal"}`}>
        <div className="text-[34px] font-bold leading-tight">{result ? (rework ? (fail ? "Vẫn KHÔNG ĐẠT" : "ĐẠT sau tái chế") : fail ? "Lô KHÔNG ĐẠT" : "Lô ĐẠT") : tested < total ? "Còn thùng chưa đo" : "Đã đo xong"}</div>
        <div className="mt-1 opacity-90">{tested}/{total} thùng mẫu{failCartons ? ` – ${failCartons} thùng vượt ngưỡng` : ""}</div>
      </div>
      {result && fail && (
        <>
          <p className="mt-4 text-center">{rework ? "Tái chế tiếp các thùng còn ẩm, sau đó đo lại toàn bộ thùng mẫu." : "Để riêng các thùng không đạt và báo QA / kho đưa đi tái chế."}</p>
          <p className="mt-1 text-center text-sm text-mute">Tái chế (phơi / sấy) xong thì bấm nút dưới để đo lại toàn bộ thùng mẫu.</p>
          <div className="mt-4"><ReworkButton planId={rootId} /></div>
        </>
      )}
      {result && !fail && <p className="mt-4 text-center text-mute">{rework ? "Đã ghi độ ẩm sau tái chế vào lô gốc và báo QA xác nhận." : "Lô đã đóng và chuyển sang Lịch sử."}</p>}
      {!result && pending > 0 && (
        <div className="mt-4 text-center">
          <p className="text-warn font-semibold">{pending} thùng chưa gửi được lên hệ thống.</p>
          <button onClick={onRetry} className="btn h-12 mt-2 px-6 text-base">Gửi lại</button>
        </div>
      )}
      {!result && pending === 0 && tested >= total && (
        <div className="mt-4 text-center"><p className="text-mute">Đã lưu đủ số đo.</p>
          <a href={`/m/lot/${encodeURIComponent(plan.plan_id)}`} className="underline text-teal-dark">Làm mới để xem kết quả lô</a></div>
      )}
      <Link href="/m" className="mt-auto pt-6 btn h-14 text-lg w-full">Lô tiếp theo</Link>
      <p className="text-center text-xs text-mute mt-3">{plan.plan_id}</p>
    </div>
  );
}
