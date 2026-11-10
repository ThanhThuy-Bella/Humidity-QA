"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile, Settings } from "@/lib/types";
import { EMAIL_DEFAULTS, EMAIL_VARS, fillVars } from "@/lib/email/defaults";

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}

const FIELDS: { k: keyof Settings; l: string; note: string; type?: string }[] = [
  { k: "hum_limit", l: "Ngưỡng độ ẩm (%) – PASS nếu ≤", note: "Chuẩn ISO" },
  { k: "sample_rate", l: "Tỷ lệ thùng mẫu (0.02 = 2%)", note: "Mẫu = max(ROUNDUP(Thùng × tỷ lệ), số màu) – mỗi màu ≥ 1 thùng" },
  { k: "readings_per_carton", l: "Số đo / thùng (áo)", note: "Cố định 3 áo / thùng" },
  { k: "rain_start", l: "Mùa mưa – từ tháng", note: "Tháng 5–10" },
  { k: "rain_end", l: "Mùa mưa – đến tháng", note: "Tháng 11–4 là mùa khô" },
  { k: "iso_weeks_rain", l: "ISO tồn tối thiểu – mùa mưa (tuần)", note: "Tính đến NGÀY KIỂM" },
  { k: "iso_weeks_dry", l: "ISO tồn tối thiểu – mùa khô (tuần)", note: "Mùa theo tháng của ngày kiểm" },
  { k: "preship_earliest", l: "Kiểm trước BPO date (ngày)", note: "Hạn kiểm = BPO − 10 → xếp vào đợt kiểm gần nhất trước hạn" },
  { k: "insp_wave_weekday", l: "Ngày đợt kiểm trong tuần", note: "1 = Thứ 2 … 6 = Thứ 7" },
  { k: "max_cartons_per_day", l: "Số thùng mẫu tối đa / ngày", note: "Vượt → dời sang ngày làm việc sau (0 = không giới hạn)" },
  { k: "preship_deadline", l: "Hạn chót trước BPO date (ngày)", note: "Quá BPO − 5 → Trễ hạn" },
  { k: "plan_lookahead", l: "Lập lịch cho BPO date trong (ngày)", note: "Tự nâng tối thiểu = (Kiểm trước BPO) + 7" },
  { k: "plan_date_override", l: "Plan date cố định", note: "Trống = hôm nay (nên để trống)", type: "date" },
  { k: "grade_filter", l: "Grade lấy từ báo cáo kho", note: "Trống = mọi grade", type: "text" },
  { k: "warehouse_sheet", l: "Sheet báo cáo kho", note: "FGs_Report", type: "text" },
  { k: "mail_subject", l: "Tiêu đề mail kho chứa", note: "Dùng trong flow Power Automate", type: "text" },
  { k: "form_warehouse", l: "Kho (in trên biểu mẫu)", note: "", type: "text" },
];

export function ParamsForm({ s, canEdit }: { s: Settings; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.k, String(s[f.k] ?? "")])));
  const [msg, setMsg] = useState("");
  async function save() {
    try { await call("/api/settings", "PUT", v); setMsg("Đã lưu. Bấm “Lập lại kế hoạch” để áp dụng cho kế hoạch đang mở."); router.refresh(); }
    catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div>
      <table className="tbl">
        <thead><tr><th>Tham số</th><th>Giá trị</th><th>Ghi chú</th></tr></thead>
        <tbody>{FIELDS.map((f) => (
          <tr key={f.k}>
            <td><label htmlFor={`s-${f.k}`}>{f.l}</label></td>
            <td><input id={`s-${f.k}`} className="input-qa w-40" type={f.type ?? "number"} step="any" value={v[f.k]} disabled={!canEdit || f.k === "readings_per_carton"}
              onChange={(e) => setV({ ...v, [f.k]: e.target.value })} /></td>
            <td className="text-mute text-xs">{f.note}</td>
          </tr>
        ))}</tbody>
      </table>
      {canEdit && <div className="mt-3 flex items-center gap-3"><button className="btn" onClick={save}>Lưu tham số</button><span className="text-sm text-mute">{msg}</span></div>}
    </div>
  );
}

const TRIGGERS = [
  { v: "CRON" as const, title: "Giờ cố định – 08:00 các ngày gửi (khuyên dùng: chỉ Thứ 7)", desc: "Thứ 7 gửi plan cho đợt kiểm Thứ 2 tuần sau (gồm lô dời sang T3… do quá tải). Đổi giờ: sửa vercel.json (giờ UTC = giờ VN − 7)." },
  { v: "AFTER_IMPORT" as const, title: "Ngay sau khi nạp Daily Stock Report", desc: "Nạp báo cáo kho (upload hoặc Power Automate) xong là gửi. Đến 09:00 vẫn chưa có báo cáo → gửi bù kèm cảnh báo." },
];
const DAY_LABELS: [number, string][] = [[1, "T2"], [2, "T3"], [3, "T4"], [4, "T5"], [5, "T6"], [6, "T7"]];

export function EmailForm({ s, canEdit }: { s: Settings; canEdit: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(s.email_enabled);
  const [skip, setSkip] = useState(s.email_skip_empty);
  const [to, setTo] = useState(s.email_recipients.join("; "));
  const [cc, setCc] = useState(s.email_cc.join("; "));
  const [days, setDays] = useState(String(s.email_days_ahead));
  const [trigger, setTrigger] = useState(s.email_trigger);
  const [sendDays, setSendDays] = useState<number[]>(s.email_send_days.filter((d) => d >= 1 && d <= 6));
  const [ahead, setAhead] = useState(s.email_notify_ahead);
  const [subj, setSubj] = useState(s.email_subject_tpl || EMAIL_DEFAULTS.subject);
  const [intro, setIntro] = useState(s.email_intro ?? EMAIL_DEFAULTS.intro);
  const [sign, setSign] = useState(s.email_signature ?? EMAIL_DEFAULTS.signature);
  const sample = { ngay: "05/11/2026", so_lo: 18, so_tre: 2, ngay_mai: "06/11/2026", so_lo_mai: 9, so_capa: 1 };
  const [msg, setMsg] = useState("");
  async function save() {
    if (on && !sendDays.length) { setMsg("Chọn ít nhất 1 ngày gửi."); return; }
    try {
      await call("/api/settings", "PUT", {
        email_enabled: on, email_skip_empty: skip, email_recipients: to, email_cc: cc, email_days_ahead: days,
        email_trigger: trigger, email_send_days: sendDays, email_notify_ahead: ahead,
        email_subject_tpl: subj, email_intro: intro, email_signature: sign,
      });
      setMsg("Đã lưu."); router.refresh();
    }
    catch (e) { setMsg((e as Error).message); }
  }
  async function send(body: object) {
    setMsg("Đang gửi…");
    try {
      const d = await call("/api/email/test", "POST", body);
      setMsg(d.sent ? `${d.queued ? "Đã xếp hàng – Outlook (máy chạy macro) sẽ gửi trong vài phút" : "Đã gửi"}: ${d.subject}${d.stale ? " (cảnh báo: báo cáo kho chưa cập nhật)" : ""}` : `Không gửi: ${d.reason}`);
      router.refresh();
    } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} disabled={!canEdit} /> Bật gửi kế hoạch tự động</label>
      <fieldset className={`space-y-2 ${on ? "" : "opacity-50"}`} disabled={!canEdit || !on}>
        <legend className="label">Thời điểm gửi</legend>
        {TRIGGERS.map((t) => (
          <label key={t.v} className={`flex gap-3 items-start rounded-md border p-3 text-sm cursor-pointer ${trigger === t.v ? "border-teal bg-teal-xl" : "border-line"}`}>
            <input type="radio" name="email_trigger" className="mt-1" checked={trigger === t.v} onChange={() => setTrigger(t.v)} />
            <span><span className="font-semibold block">{t.title}</span><span className="text-mute text-xs">{t.desc}</span></span>
          </label>
        ))}
        <div>
          <span className="label">Ngày gửi</span>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map(([d, l]) => {
              const sel = sendDays.includes(d);
              return (
                <button key={d} type="button" aria-pressed={sel}
                  className={`min-w-[44px] h-11 px-2 rounded-md text-sm font-semibold border ${sel ? "bg-ink text-white border-ink" : "bg-white text-mute border-line"}`}
                  onClick={() => setSendDays(sel ? sendDays.filter((x) => x !== d) : [...sendDays, d].sort())}>{l}</button>
              );
            })}
          </div>
        </div>
        <label className="flex gap-3 items-start text-sm">
          <input type="checkbox" className="mt-1" checked={ahead} onChange={(e) => setAhead(e.target.checked)} />
          <span><span className="font-semibold block">Gửi PLAN BỔ SUNG khi có lô gấp</span>
            <span className="text-mute text-xs">Lô mới không kịp chờ đợt kiểm của email tuần (BPO − 10 rơi trước đợt kế tiếp) → nạp báo cáo kho xong tự gửi email “HUMIDITY CHECKING PLAN BỔ SUNG” kèm file plan.</span></span>
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} disabled={!canEdit} /> Không gửi vào ngày không có lô nào</label>
      <div><label className="label" htmlFor="to">Gửi tới (cách nhau bằng ;)</label><input id="to" className="input w-full" value={to} onChange={(e) => setTo(e.target.value)} disabled={!canEdit} /></div>
      <div><label className="label" htmlFor="cc">CC</label><input id="cc" className="input w-full" value={cc} onChange={(e) => setCc(e.target.value)} disabled={!canEdit} /></div>
      <fieldset className="space-y-2 rounded-md border border-line p-3" disabled={!canEdit}>
        <legend className="label px-1">Nội dung email</legend>
        <div>
          <label className="label" htmlFor="subj">Tiêu đề</label>
          <input id="subj" className="input w-full" value={subj} onChange={(e) => setSubj(e.target.value)} maxLength={200} />
          <p className="text-xs text-mute mt-1">Xem trước: <b className="text-ink">{fillVars(subj, sample).replace(/\s*\(0 trễ hạn\)/, "")}</b></p>
        </div>
        <div>
          <label className="label" htmlFor="intro">Lời mở đầu (đầu email)</label>
          <textarea id="intro" className="input w-full h-auto py-2" rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={2000} />
        </div>
        <div>
          <label className="label" htmlFor="sign">Chữ ký (cuối email)</label>
          <textarea id="sign" className="input w-full h-auto py-2" rows={3} value={sign} onChange={(e) => setSign(e.target.value)} maxLength={2000} />
        </div>
        <div className="text-xs text-mute">
          Có thể chèn biến – hệ thống tự thay khi gửi:
          <div className="flex flex-wrap gap-1.5 mt-1">
            {EMAIL_VARS.map(([k, d]) => (
              <button key={k} type="button" title={d} onClick={() => setSubj((x) => x + " " + k)}
                className="rounded bg-teal-xl border border-teal-soft px-1.5 py-0.5 font-mono text-teal-dark">{k}</button>
            ))}
          </div>
          <p className="mt-1">Bấm vào biến để chèn vào cuối tiêu đề. Ví dụ {"{so_lo}"} = số lô cần kiểm hôm nay, {"{so_tre}"} = số lô trễ hạn. Bảng danh sách lô luôn tự có trong email.</p>
        </div>
        <button type="button" className="text-xs underline text-teal-dark" onClick={() => { setSubj(EMAIL_DEFAULTS.subject); setIntro(EMAIL_DEFAULTS.intro); setSign(EMAIL_DEFAULTS.signature); }}>Khôi phục nội dung mặc định</button>
      </fieldset>
      <div><label className="label" htmlFor="days">Kèm lô xếp lịch trong N ngày tới (tối thiểu: ngày gửi kế tiếp)</label><input id="days" type="number" className="input w-24" value={days} onChange={(e) => setDays(e.target.value)} disabled={!canEdit} /></div>
      <div className="flex flex-wrap gap-2">
        <a className="btn-ghost" href="/api/email/preview" target="_blank" rel="noreferrer">Xem trước email</a>
        {canEdit && <>
          <button className="btn" onClick={save}>Lưu</button>
          <button className="btn-ghost" onClick={() => send({ toMe: true })}>Gửi thử cho tôi</button>
          <button className="btn-ghost" onClick={() => window.confirm("Gửi email kế hoạch ngay cho cả danh sách?") && send({ now: true })}>Gửi ngay cho danh sách</button>
        </>}
      </div>
      {s.last_email_date && <p className="text-xs text-mute">Lần gửi tự động gần nhất: {s.last_email_date.split("-").reverse().join("/")}</p>}
      {msg && <p className="text-sm text-mute">{msg}</p>}
    </div>
  );
}

export function StoresTable({ rows, canEdit }: { rows: { store_name: string; include: boolean; rows_in_report: number; note: string | null }[]; canEdit: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function toggle(store_name: string, include: boolean) {
    try { await call("/api/stores", "PUT", { store_name, include }); router.refresh(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div>
      <table className="tbl">
        <thead><tr><th>Store</th><th>Tính tồn & kiểm ẩm</th><th className="num">Dòng trong báo cáo</th><th>Ghi chú</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.store_name}>
            <td>{r.store_name}</td>
            <td><label className="flex items-center gap-2"><input type="checkbox" checked={r.include} disabled={!canEdit} onChange={(e) => toggle(r.store_name, e.target.checked)} />{r.include ? "Y" : "N"}</label></td>
            <td className="num">{r.rows_in_report.toLocaleString()}</td><td className="text-xs text-warn">{r.note}</td>
          </tr>
        ))}</tbody>
      </table>
      {err && <p className="text-sm text-fail">{err}</p>}
    </div>
  );
}

export function BrandMapTable({ rows, canEdit }: { rows: { brand_name: string; brand_code: string; note: string | null; auto_added: boolean }[]; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [nb, setNb] = useState({ brand_name: "", brand_code: "" });
  const [err, setErr] = useState("");
  async function save(brand_name: string, brand_code: string) {
    try { await call("/api/brand-map", "PUT", { brand_name, brand_code }); setEdit({}); setNb({ brand_name: "", brand_code: "" }); router.refresh(); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <div>
      <table className="tbl">
        <thead><tr><th>Brand name (báo cáo kho)</th><th>Brand code (plan / report)</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.brand_name} className={r.auto_added ? "bg-input" : ""}>
              <td>{r.brand_name}</td>
              <td><input className="input h-8 w-32" aria-label={`Code ${r.brand_name}`} value={edit[r.brand_name] ?? r.brand_code} disabled={!canEdit}
                onChange={(e) => setEdit({ ...edit, [r.brand_name]: e.target.value })} /></td>
              <td className="text-xs text-mute">{r.note}</td>
              <td>{canEdit && (edit[r.brand_name] !== undefined || r.auto_added) && <button className="btn-ghost h-8" onClick={() => save(r.brand_name, edit[r.brand_name] ?? r.brand_code)}>Lưu</button>}</td>
            </tr>
          ))}
          {canEdit && (
            <tr>
              <td><input className="input h-8 w-full" placeholder="Brand name mới" value={nb.brand_name} onChange={(e) => setNb({ ...nb, brand_name: e.target.value })} /></td>
              <td><input className="input h-8 w-32" placeholder="Code" value={nb.brand_code} onChange={(e) => setNb({ ...nb, brand_code: e.target.value })} /></td>
              <td></td><td><button className="btn h-8" onClick={() => save(nb.brand_name, nb.brand_code)}>Thêm</button></td>
            </tr>
          )}
        </tbody>
      </table>
      {err && <p className="text-sm text-fail">{err}</p>}
      <p className="text-xs text-mute mt-2">Dòng nền vàng = tự thêm khi gặp brand mới (code = tiền tố Style no) – cần xem lại. Thay đổi áp dụng từ lần nạp báo cáo kho kế tiếp.</p>
    </div>
  );
}

export function UsersTable({ rows, meId }: { rows: Profile[]; meId: string }) {
  const router = useRouter();
  const [nu, setNu] = useState({ email: "", password: "", full_name: "", role: "qa" });
  const [msg, setMsg] = useState("");
  async function setRole(id: string, role: string) {
    try { await call("/api/users", "PUT", { id, role }); router.refresh(); } catch (e) { setMsg((e as Error).message); }
  }
  async function resetPw(id: string, email: string | null) {
    const pw = window.prompt(`Mật khẩu mới cho ${email} (≥ 8 ký tự):`);
    if (!pw) return;
    try { await call("/api/users", "PUT", { id, password: pw }); setMsg(`Đã đổi mật khẩu cho ${email}.`); } catch (e) { setMsg((e as Error).message); }
  }
  async function create() {
    try { await call("/api/users", "POST", nu); setNu({ email: "", password: "", full_name: "", role: "qa" }); setMsg("Đã tạo tài khoản."); router.refresh(); }
    catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div>
      <table className="tbl mb-3">
        <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th></th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td>
            <td><select className="input h-8" aria-label={`Vai trò ${u.email}`} value={u.role} disabled={u.id === meId} onChange={(e) => setRole(u.id, e.target.value)}>
              <option value="admin">admin</option><option value="planner">planner</option><option value="qa">qa</option><option value="viewer">viewer</option></select></td>
            <td><button className="text-xs underline text-teal-dark" onClick={() => resetPw(u.id, u.email)}>Đặt lại mật khẩu</button></td></tr>
        ))}</tbody>
      </table>
      <div className="flex flex-wrap gap-2 items-end">
        <input className="input" placeholder="Họ tên" value={nu.full_name} onChange={(e) => setNu({ ...nu, full_name: e.target.value })} />
        <input className="input" placeholder="Email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
        <input className="input" placeholder="Mật khẩu tạm (≥ 8)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
        <select className="input" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option>qa</option><option>planner</option><option>viewer</option><option>admin</option></select>
        <button className="btn" onClick={create}>Tạo tài khoản</button>
      </div>
      {msg && <p className="text-sm text-mute mt-2">{msg}</p>}
      <p className="text-xs text-mute mt-2">admin: toàn quyền · planner: nạp báo cáo kho, lập kế hoạch, cài đặt · qa: nhập số đo, CAPA · viewer: chỉ xem.</p>
    </div>
  );
}
