"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type D = Record<string, unknown>;
/**
 * Cách hiển thị kết quả – chọn bằng chuỗi (KHÔNG truyền hàm từ Server Component sang
 * Client Component: Next.js báo lỗi "Functions cannot be passed directly to Client Components").
 */
const RESULT: Record<string, (d: D) => string> = {
  plan: (d) => `${d.newTasks} lô mới · ${d.rescheduled} dời lịch · ${d.removed} hủy · ${d.archived} đóng`,
  capa: (d) => `${d.capa_no}`,
  email: (d) => (d.sent ? `Đã gửi: ${d.subject}` : `Không gửi: ${d.reason}`),
  resend: (d) => (d.sent ? "Đã gửi" : `Không gửi: ${d.reason}`),
};

/** Nút gọi API (POST) – hiện kết quả, refresh trang. Thay cho các nút macro VBA */
export default function ActionButton({
  url, body, label, busyLabel = "Đang chạy…", confirm, ghost, result,
}: {
  url: string; body?: unknown; label: string; busyLabel?: string; confirm?: string; ghost?: boolean;
  result?: "plan" | "capa" | "email" | "resend";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await r.json().catch(() => ({ error: r.statusText }));
      if (!r.ok) throw new Error(data.error || r.statusText);
      setMsg({ ok: true, text: result ? RESULT[result](data) : "Xong" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button className={ghost ? "btn-ghost" : "btn"} onClick={run} disabled={busy}>{busy ? busyLabel : label}</button>
      {msg && <span className={`text-xs max-w-xs ${msg.ok ? "text-pass" : "text-fail"}`}>{msg.text}</span>}
    </span>
  );
}
