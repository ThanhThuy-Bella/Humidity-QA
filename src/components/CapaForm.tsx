"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Capa } from "@/lib/types";

const STATUS: { v: Capa["status"]; l: string }[] = [
  { v: "OPEN", l: "Mở" }, { v: "IN_PROGRESS", l: "Đang xử lý" }, { v: "VERIFICATION", l: "Chờ xác nhận" },
  { v: "CLOSED", l: "Đóng" }, { v: "CANCELLED", l: "Hủy" },
];

export default function CapaForm({ capa, limit, canEdit }: { capa: Capa; limit: number; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({
    problem: capa.problem ?? "", root_cause: capa.root_cause ?? "", containment: capa.containment ?? "",
    corrective_action: capa.corrective_action ?? "", preventive_action: capa.preventive_action ?? "",
    owner: capa.owner ?? "", due_date: capa.due_date ?? "", rework_humidity: capa.rework_humidity?.toString() ?? "",
    verification: capa.verification ?? "", status: capa.status, comment: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/capa/${capa.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({ error: r.statusText }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, t: d.error });
    setMsg({ ok: true, t: "Đã lưu." });
    setF((x) => ({ ...x, comment: "" }));
    router.refresh();
  }

  const area = (k: keyof typeof f, label: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={k}>{label}</label>
      <textarea id={k} rows={3} className="input w-full h-auto py-2" value={f[k]} onChange={set(k)} disabled={!canEdit} placeholder={hint} />
    </div>
  );
  const rw = Number(f.rework_humidity.replace(",", "."));

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        {area("problem", "Mô tả vấn đề (D2)")}
        {area("containment", "Khắc phục tức thời (D3) – tái chế / sấy / cách ly", "VD: cách ly 6 thùng FAIL, mở thùng phơi/sấy 24h, đo lại")}
        {area("root_cause", "Nguyên nhân gốc (D4)", "VD: thùng xếp sát tường ẩm khu NC, pallet không có lót")}
        {area("corrective_action", "Hành động khắc phục (D5–D6)")}
        {area("preventive_action", "Phòng ngừa tái diễn (D7)")}
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="owner">Phụ trách</label><input id="owner" className="input w-full" value={f.owner} onChange={set("owner")} disabled={!canEdit} /></div>
          <div><label className="label" htmlFor="due">Hạn hoàn thành</label><input id="due" type="date" className="input w-full" value={f.due_date} onChange={set("due_date")} disabled={!canEdit} /></div>
          <div>
            <label className="label" htmlFor="rw">Độ ẩm sau tái chế (%)</label>
            <input id="rw" inputMode="decimal" className={`input w-full ${f.rework_humidity && rw > limit ? "text-fail font-bold" : ""}`} value={f.rework_humidity} onChange={set("rework_humidity")} disabled={!canEdit} />
            {f.rework_humidity && !Number.isNaN(rw) && <span className={`text-xs ${rw > limit ? "text-fail" : "text-pass"}`}>{rw > limit ? `Vẫn > ${limit}% – cần tái chế tiếp` : `Đạt ≤ ${limit}%`}</span>}
          </div>
          <div><label className="label" htmlFor="st">Trạng thái</label>
            <select id="st" className="input w-full" value={f.status} onChange={set("status")} disabled={!canEdit}>
              {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select></div>
        </div>
        {area("verification", "Xác nhận hiệu quả (D8)", "VD: đo lại 3 thùng ngày …, max 5.8% – đạt")}
        <div><label className="label" htmlFor="cm">Ghi chú cho lần cập nhật này</label><input id="cm" className="input w-full" value={f.comment} onChange={set("comment")} disabled={!canEdit} /></div>
        {canEdit && <button className="btn" onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu CAPA"}</button>}
        {msg && <p className={`text-sm ${msg.ok ? "text-pass" : "text-fail"}`}>{msg.t}</p>}
        <p className="text-xs text-mute">Đóng CAPA cần: nguyên nhân gốc, hành động khắc phục và độ ẩm sau tái chế ≤ {limit}%. Độ ẩm sau tái chế được ghi ngược về Lịch sử kiểm.</p>
      </div>
    </div>
  );
}
