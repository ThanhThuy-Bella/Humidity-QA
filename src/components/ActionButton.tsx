"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Nút gọi API (POST) – hiện kết quả, refresh trang. Thay cho các nút macro VBA */
export default function ActionButton({
  url, body, label, busyLabel = "Đang chạy…", confirm, ghost, render,
}: {
  url: string; body?: unknown; label: string; busyLabel?: string; confirm?: string; ghost?: boolean;
  render?: (data: Record<string, unknown>) => string;
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
      setMsg({ ok: true, text: render ? render(data) : "Xong" });
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
