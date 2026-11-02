"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PlanView, ReadingRow } from "@/lib/types";

/**
 * Form "Nhập kết quả kiểm ẩm" – thay sheet Nhap của VBA (BuildNhap / LoadLot / SaveLotCore).
 * Dùng chung cho máy tính (bảng) và điện thoại (thẻ từng thùng – Mobile Inspection qua QR).
 *  - Vị trí ▼ lấy từ báo cáo kho của lô; Pallet ▼ theo vị trí đã chọn.
 *  - Gõ 4,5 hoặc 4.5 đều được. Đủ 3 số của 1 thùng là tự lưu (hàng đợi, không mất số khi gõ nhanh).
 *  - Mất sóng trong kho: số đo giữ trong máy (bản nháp), tự gửi lại khi có mạng.
 *  - Đủ số thùng mẫu → lô tự đóng PASS/FAIL, chuyển Lịch sử (FAIL → tạo CAPA).
 */
type Row = {
  sampleNo: number;
  location: string;
  pallet: string;
  auditCartonNo: string;
  qtyInCarton: string;
  r1: string;
  r2: string;
  r3: string;
  dirty: boolean;
};
type Meta = { date: string; qa: string; rework: string; remark: string };
type Draft = { at: number; meta: Meta; rows: Row[] };
type Msg = { tone: "ok" | "err" | "warn" | "done-pass" | "done-fail"; text: string; capa?: string | null };

const SUSPICIOUS = 15; // số đo > 15% gần như chắc gõ nhầm (45 thay vì 4.5)

const parseNum = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t || /[^0-9.]/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const isBad = (s: string) => s.trim() !== "" && parseNum(s) === null;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const draftKey = (id: string) => `hm-draft:${id}`;

export default function InspectionEntry({
  plan, readings, limit, perCarton, today, defaultQa, mobile = false, canEdit = true,
}: {
  plan: PlanView; readings: ReadingRow[]; limit: number; perCarton: number; today: string; defaultQa: string;
  mobile?: boolean; canEdit?: boolean;
}) {
  const router = useRouter();
  const minDate = useMemo(() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 14);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const serverRows = useMemo<Row[]>(
    () => [...readings].sort((a, b) => a.sample_no - b.sample_no).map((r) => ({
      sampleNo: r.sample_no, location: str(r.location), pallet: str(r.pallet), auditCartonNo: str(r.audit_carton_no),
      qtyInCarton: str(r.qty_in_carton), r1: str(r.r1), r2: str(r.r2), r3: str(r.r3), dirty: false,
    })),
    [readings],
  );
  const serverMeta = useMemo<Meta>(() => {
    const used = readings.filter((r) => r.reading_count > 0 && r.inspection_date).map((r) => r.inspection_date!).sort().pop();
    const d = used ?? plan.inspection_date ?? plan.sched_date;
    return { date: d > today ? today : d < minDate ? today : d, qa: plan.qa_name ?? defaultQa, rework: str(plan.rework_humidity), remark: plan.remark ?? "" };
  }, [readings, plan, today, minDate, defaultQa]);

  const [meta, setMeta] = useState<Meta>(serverMeta);
  const [rows, setRows] = useState<Row[]>(serverRows);
  const [metaDirty, setMetaDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [msg, setMsg] = useState<Msg | null>(null);
  const closed = msg?.tone === "done-pass" || msg?.tone === "done-fail";
  const locked = closed || !canEdit;

  // ref luôn giữ state mới nhất (cho hàng đợi tự lưu / sự kiện online)
  const rowsRef = useRef(rows);
  const metaRef = useRef(meta);
  const busyRef = useRef(false);
  const queued = useRef(false);
  rowsRef.current = rows;
  metaRef.current = meta;

  // ---- khôi phục bản nháp (nếu QA nhập lúc mất sóng rồi tải lại trang)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(plan.plan_id));
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (!d.rows?.some((r) => r.dirty)) return;
      const bySample = new Map(d.rows.map((r) => [r.sampleNo, r]));
      setRows((cur) => cur.map((r) => (bySample.get(r.sampleNo)?.dirty ? { ...bySample.get(r.sampleNo)!, dirty: true } : r)));
      setMeta(d.meta);
      setMetaDirty(true);
      setMsg({ tone: "warn", text: `Đã khôi phục số đo chưa lưu từ ${new Date(d.at).toLocaleTimeString("vi-VN")}. Bấm “Lưu số đo” để gửi.` });
    } catch {
      /* bản nháp hỏng → bỏ qua */
    }
  }, [plan.plan_id]);

  // ---- ghi bản nháp mỗi khi có thay đổi chưa lưu
  useEffect(() => {
    try {
      if (rows.some((r) => r.dirty) || metaDirty) {
        localStorage.setItem(draftKey(plan.plan_id), JSON.stringify({ at: Date.now(), meta, rows } satisfies Draft));
      } else {
        localStorage.removeItem(draftKey(plan.plan_id));
      }
    } catch {
      /* hết bộ nhớ / chế độ riêng tư */
    }
  }, [rows, meta, metaDirty, plan.plan_id]);

  const save = useCallback(async (onlyComplete = false) => {
    if (locked) return;
    if (busyRef.current) {
      queued.current = true;
      return;
    }
    const current = rowsRef.current;
    const m = metaRef.current;
    const pick = current.filter((r) => r.dirty && (!onlyComplete || [r.r1, r.r2, r.r3].filter((x) => parseNum(x) !== null).length >= perCarton));
    if (onlyComplete && pick.length === 0) return;
    if (m.date > today) return setMsg({ tone: "err", text: "Ngày kiểm ẩm không được sau hôm nay." });
    const bad = pick.find((r) => [r.r1, r.r2, r.r3].some(isBad));
    if (bad) return setMsg({ tone: "err", text: `Thùng ${bad.sampleNo}: có ô số đo không phải số.` });

    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/inspect/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.plan_id, inspectionDate: m.date, qaName: m.qa, reworkHumidity: m.rework, remark: m.remark,
          rows: (onlyComplete ? pick : current).map((r) => ({
            sampleNo: r.sampleNo, location: r.location, pallet: r.pallet, auditCartonNo: r.auditCartonNo,
            qtyInCarton: r.qtyInCarton, r1: r.r1, r2: r.r2, r3: r.r3,
          })),
        }),
      });
      const d = await res.json().catch(() => ({ error: res.statusText }));
      if (res.status === 401) throw Object.assign(new Error("Phiên đăng nhập đã hết hạn. Số đo vẫn giữ trên máy – đăng nhập lại rồi mở lại lô này."), { auth: true });
      if (!res.ok) throw new Error(d.error || res.statusText);
      // chỉ bỏ cờ "dirty" của những dòng không bị sửa thêm trong lúc gửi
      const sent = new Map((onlyComplete ? pick : current).map((r) => [r.sampleNo, r]));
      setRows((rs) => rs.map((r) => {
        const s = sent.get(r.sampleNo);
        return s && s.r1 === r.r1 && s.r2 === r.r2 && s.r3 === r.r3 && s.location === r.location && s.pallet === r.pallet
          && s.auditCartonNo === r.auditCartonNo && s.qtyInCarton === r.qtyInCarton ? { ...r, dirty: false } : r;
      }));
      setMetaDirty(false);
      if (d.status === "ARCHIVED") {
        try { localStorage.removeItem(draftKey(plan.plan_id)); } catch { /* */ }
        setMsg({ tone: d.result === "PASS" ? "done-pass" : "done-fail", text: `Đã đóng lô ${plan.plan_id}: ${d.result} – đã chuyển sang Lịch sử kiểm.`, capa: d.capaNo });
        router.refresh();
      } else {
        setMsg({ tone: "ok", text: `Đã lưu lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · ${d.tested}/${d.need} thùng đủ số đo.` });
      }
    } catch (e) {
      const offline = e instanceof TypeError || !navigator.onLine;
      setMsg({
        tone: offline ? "warn" : "err",
        text: offline ? "Mất sóng – chưa gửi được. Số đo vẫn giữ trên máy, sẽ tự gửi khi có mạng." : e instanceof Error ? e.message : String(e),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (queued.current) {
        queued.current = false;
        setTimeout(() => save(true), 0);
      }
    }
  }, [locked, perCarton, plan.plan_id, router, today]);

  // ---- trạng thái mạng + tự gửi lại khi có sóng
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); if (rowsRef.current.some((r) => r.dirty)) save(false); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [save]);

  // ---- cảnh báo khi rời trang còn số chưa lưu
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (rowsRef.current.some((r) => r.dirty)) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const locs = Object.keys(plan.location_pallets ?? {});
  const stats = useMemo(() => {
    let tested = 0, fail = 0;
    const seen = new Map<string, number>();
    const dup = new Set<string>();
    for (const r of rows) {
      const v = [r.r1, r.r2, r.r3].map(parseNum).filter((x): x is number => x !== null);
      if (v.length >= perCarton) tested++;
      if (v.some((x) => x > limit)) fail++;
      const c = r.auditCartonNo.trim().toUpperCase();
      if (c) { if (seen.has(c)) dup.add(c); seen.set(c, r.sampleNo); }
    }
    const dirty = rows.filter((r) => r.dirty).length;
    const nextTodo = rows.find((r) => [r.r1, r.r2, r.r3].filter((x) => parseNum(x) !== null).length < perCarton)?.sampleNo;
    return { tested, fail, dup, dirty, nextTodo };
  }, [rows, limit, perCarton]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch, dirty: true } : r)));
  }
  function setM(patch: Partial<Meta>) {
    setMeta((m) => ({ ...m, ...patch }));
    setMetaDirty(true);
  }

  const cellIn = mobile ? "input-qa h-11 w-full" : "input-qa h-8 w-full";
  const readIn = (i: number, k: "r1" | "r2" | "r3", label: string) => {
    const raw = rows[i][k];
    const v = parseNum(raw);
    const tone = isBad(raw) ? "border-fail ring-1 ring-fail" : v !== null && v > SUSPICIOUS ? "text-warn font-bold ring-1 ring-warn"
      : v !== null && v > limit ? "text-fail font-bold" : "";
    return (
      <input aria-label={`Thùng ${rows[i].sampleNo} ${label}`} inputMode="decimal" enterKeyHint="next" autoComplete="off" disabled={locked}
        className={`${cellIn} text-right tabular-nums ${tone}`} value={raw}
        onChange={(e) => update(i, { [k]: e.target.value } as Partial<Row>)} onBlur={() => save(true)} />
    );
  };
  const locSelect = (i: number) => (
    <select aria-label="Vị trí" className={cellIn} value={rows[i].location} disabled={locked}
      onChange={(e) => update(i, { location: e.target.value, pallet: "" })}>
      <option value=""></option>
      {locs.map((l) => <option key={l}>{l}</option>)}
      {rows[i].location && !locs.includes(rows[i].location) && <option>{rows[i].location}</option>}
    </select>
  );
  const palSelect = (i: number) => {
    const pals = plan.location_pallets?.[rows[i].location] ?? [];
    return (
      <select aria-label="Pallet" className={cellIn} value={rows[i].pallet} disabled={locked} onChange={(e) => update(i, { pallet: e.target.value })}>
        <option value=""></option>
        {pals.map((p) => <option key={p}>{p}</option>)}
        {rows[i].pallet && !pals.includes(rows[i].pallet) && <option>{rows[i].pallet}</option>}
      </select>
    );
  };
  const cartonIn = (i: number) => {
    const dup = stats.dup.has(rows[i].auditCartonNo.trim().toUpperCase());
    return (
      <input aria-label={`Thùng ${rows[i].sampleNo} số thùng`} className={`${cellIn} ${dup ? "ring-1 ring-warn" : ""}`} value={rows[i].auditCartonNo}
        disabled={locked} onChange={(e) => update(i, { auditCartonNo: e.target.value })} onBlur={() => save(true)} />
    );
  };
  const rowMax = (r: Row) => {
    const v = [r.r1, r.r2, r.r3].map(parseNum).filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const jump = (n?: number) => n && document.getElementById(`carton-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div>
      {!online && <div role="status" className="mb-3 rounded bg-input border border-warn/40 text-warn text-sm p-2.5">Đang mất sóng – cứ nhập tiếp, số đo được giữ trên máy và tự gửi khi có mạng.</div>}
      {!canEdit && <div className="mb-3 rounded bg-[#F1F4F6] text-mute text-sm p-2.5">Tài khoản chỉ xem (viewer) – không lưu được số đo.</div>}

      {/* thông tin lô */}
      <div className={`card p-4 mb-3 ${mobile ? "" : "grid md:grid-cols-[1fr_auto] gap-4"}`}>
        <div>
          <div className="text-lg font-bold text-teal-dark break-all">{plan.jo} <span className="text-mute font-normal text-sm">/ {plan.buyer_po}</span></div>
          <div className="text-sm text-mute mt-0.5">
            {plan.brand_code} · {plan.cartons} thùng · nhập kho {fmt(plan.stock_in_date)} · BPO {fmt(plan.bpo_date)} · {plan.plan_id}
          </div>
          <div className="text-sm mt-1">
            Trạng thái: <b>{vn(plan.lot_result)}</b> · {plan.trigger === "PRE-SHIPMENT" ? "Kiểm trước xuất" : plan.kind === "REWORK" ? `Kiểm lại sau tái chế (lô gốc ${plan.parent_plan_id})` : "Kiểm lại (BPO mới)"} ·{" "}
            <span className={plan.priority === "LATE" ? "text-fail font-semibold" : "text-pass"}>{plan.priority === "LATE" ? "Trễ hạn" : "Đúng hạn"}</span>
          </div>
          {plan.locations && <div className="text-xs text-mute mt-1">Vị trí trong kho: {plan.locations}</div>}
        </div>
        <div className={`${mobile ? "mt-3 flex items-end justify-between" : "text-right"}`}>
          <div>
            <div className="text-2xl font-bold tabular-nums text-teal-dark">{stats.tested} / {plan.sample_cartons}</div>
            <div className="text-xs text-mute">thùng đã đo đủ {perCarton} số</div>
          </div>
          {stats.fail > 0 && <div className="text-sm font-semibold text-fail mt-1">Có số đo &gt; {limit}% → lô FAIL</div>}
        </div>
      </div>

      {/* thông tin cấp lô */}
      <div className={`grid gap-3 mb-3 ${mobile ? "grid-cols-2" : "md:grid-cols-4"}`}>
        <div><label className="label" htmlFor="m-date">Ngày kiểm ẩm</label>
          <input id="m-date" type="date" className="input-qa w-full" value={meta.date} min={minDate} max={today} disabled={locked}
            onChange={(e) => setM({ date: e.target.value })} /></div>
        <div><label className="label" htmlFor="m-qa">QA kiểm</label>
          <input id="m-qa" className="input-qa w-full" value={meta.qa} disabled={locked} onChange={(e) => setM({ qa: e.target.value })} /></div>
        <div><label className="label" htmlFor="m-rw">Độ ẩm sau tái chế nếu FAIL (%)</label>
          <input id="m-rw" inputMode="decimal" className={`input-qa w-full ${isBad(meta.rework) ? "ring-1 ring-fail" : ""}`} value={meta.rework} disabled={locked}
            onChange={(e) => setM({ rework: e.target.value })} /></div>
        <div className={mobile ? "col-span-2" : ""}><label className="label" htmlFor="m-rm">Ghi chú / CAPA</label>
          <input id="m-rm" className="input-qa w-full" value={meta.remark} disabled={locked} onChange={(e) => setM({ remark: e.target.value })} /></div>
      </div>

      {stats.dup.size > 0 && <p className="text-sm text-warn mb-2">Số thùng bị trùng: {Array.from(stats.dup).join(", ")} – kiểm tra lại.</p>}

      {/* thùng mẫu */}
      {mobile ? (
        <>
          {rows.length > 3 && (
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 no-print" aria-label="Chuyển nhanh tới thùng">
              {rows.map((r) => {
                const n = [r.r1, r.r2, r.r3].filter((x) => parseNum(x) !== null).length;
                const mx = rowMax(r);
                const c = mx !== null && mx > limit ? "bg-fail text-white" : n >= perCarton ? "bg-pass text-white" : n > 0 ? "bg-prog-bg text-teal-dark" : "bg-white text-mute border border-line";
                return <button key={r.sampleNo} onClick={() => jump(r.sampleNo)} className={`shrink-0 w-9 h-9 rounded text-sm font-semibold ${c}`}>{r.sampleNo}</button>;
              })}
            </div>
          )}
          <div className="space-y-3">
            {rows.map((r, i) => {
              const mx = rowMax(r);
              return (
                <div key={r.sampleNo} id={`carton-${r.sampleNo}`} className={`card p-3 scroll-mt-16 ${mx !== null && mx > limit ? "border-fail" : ""}`}>
                  <div className="flex justify-between items-center mb-2">
                    <b className="text-teal-dark">Thùng mẫu {r.sampleNo}/{rows.length}{r.dirty && <span className="ml-2 text-xs text-warn font-normal">chưa lưu</span>}</b>
                    {mx !== null && <span className={`text-sm font-semibold ${mx > limit ? "text-fail" : "text-pass"}`}>Max {mx}% · {mx > limit ? "FAIL" : "PASS"}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div><span className="label">Vị trí</span>{locSelect(i)}</div>
                    <div><span className="label">Pallet</span>{palSelect(i)}</div>
                    <div><span className="label">Số thùng</span>{cartonIn(i)}</div>
                    <div><span className="label">SL áo</span><input inputMode="numeric" className={cellIn} value={r.qtyInCarton} disabled={locked} onChange={(e) => update(i, { qtyInCarton: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><span className="label">Áo 1 (%)</span>{readIn(i, "r1", "áo 1")}</div>
                    <div><span className="label">Áo 2 (%)</span>{readIn(i, "r2", "áo 2")}</div>
                    <div><span className="label">Áo 3 (%)</span>{readIn(i, "r3", "áo 3")}</div>
                  </div>
                  {[r.r1, r.r2, r.r3].some((x) => (parseNum(x) ?? 0) > SUSPICIOUS) && <p className="text-xs text-warn mt-1.5">Số đo trên {SUSPICIOUS}% – có gõ nhầm dấu phẩy không?</p>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>#</th><th className="!bg-teal !text-white">Vị trí ▼</th><th className="!bg-teal !text-white">Pallet ▼</th>
              <th className="!bg-teal !text-white">Số thùng</th><th className="!bg-teal !text-white">SL áo</th>
              <th className="!bg-teal !text-white num">Áo 1</th><th className="!bg-teal !text-white num">Áo 2</th><th className="!bg-teal !text-white num">Áo 3</th>
              <th className="num">Max</th><th>Kết quả</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const mx = rowMax(r);
                return (
                  <tr key={r.sampleNo}>
                    <td className="text-mute">{r.sampleNo}{r.dirty && <span className="text-warn" title="chưa lưu"> •</span>}</td>
                    <td className="min-w-[90px]">{locSelect(i)}</td>
                    <td className="min-w-[110px]">{palSelect(i)}</td>
                    <td className="min-w-[90px]">{cartonIn(i)}</td>
                    <td className="min-w-[70px]"><input inputMode="numeric" className={cellIn} value={r.qtyInCarton} disabled={locked} onChange={(e) => update(i, { qtyInCarton: e.target.value })} /></td>
                    <td className="w-20">{readIn(i, "r1", "áo 1")}</td>
                    <td className="w-20">{readIn(i, "r2", "áo 2")}</td>
                    <td className="w-20">{readIn(i, "r3", "áo 3")}</td>
                    <td className="num">{mx ?? ""}</td>
                    <td>{mx !== null && <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${mx > limit ? "bg-fail-bg text-fail" : "bg-pass-bg text-pass"}`}>{mx > limit ? "FAIL" : "PASS"}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {msg && (
        <div role="status" className={`mt-3 rounded p-3 text-sm ${
          msg.tone === "err" ? "bg-fail-bg text-fail" : msg.tone === "warn" ? "bg-input text-warn"
          : msg.tone === "done-fail" ? "bg-fail-bg text-fail font-semibold"
          : msg.tone === "done-pass" ? "bg-pass-bg text-pass font-semibold" : "bg-teal-xl text-teal-dark"}`}>
          {msg.text}
          {msg.capa && <> Đã tạo phiếu <Link className="underline" href="/capa">{msg.capa}</Link> – cần xử lý tái chế/CAPA.</>}
        </div>
      )}

      <div className={`mt-4 flex gap-2 ${mobile ? "sticky bottom-0 bg-page py-3 -mx-3 px-3 border-t border-line" : ""}`}>
        {!closed ? (
          <>
            <button className={`btn ${mobile ? "flex-1 h-12 text-base" : ""}`} disabled={busy || locked} onClick={() => save(false)}>
              {busy ? "Đang lưu…" : stats.dirty || metaDirty ? `Lưu số đo${stats.dirty ? ` (${stats.dirty})` : ""}` : "Lưu số đo"}
            </button>
            {mobile && stats.nextTodo && rows.length > 1 && (
              <button className="btn-ghost h-12 px-4 text-base" onClick={() => jump(stats.nextTodo)}>Thùng {stats.nextTodo} ↓</button>
            )}
          </>
        ) : (
          <Link href={mobile ? "/m" : "/inspect"} className={`btn ${mobile ? "flex-1 h-12 text-base" : ""}`}>Chọn lô khác</Link>
        )}
      </div>
      <p className="text-xs text-mute mt-2">
        Gõ 4,5 hoặc 4.5 đều được. Đủ {perCarton} số của một thùng là tự lưu. Đủ {plan.sample_cartons} thùng mẫu là lô tự đóng PASS/FAIL và chuyển sang Lịch sử.
      </p>
    </div>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function vn(s: string) {
  return ({ PENDING: "Chờ kiểm", "IN PROGRESS": "Đang kiểm", PASS: "PASS", FAIL: "FAIL" } as Record<string, string>)[s] ?? s;
}
