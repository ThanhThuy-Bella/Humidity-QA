"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Nút "Nhập kiểm lại sau tái chế": tạo (hoặc mở lại) lượt kiểm lại rồi chuyển thẳng tới form nhập */
export default function ReworkButton({ planId, target = "mobile", size = "lg", label = "Nhập kiểm lại sau tái chế" }: {
  planId: string; target?: "mobile" | "desk"; size?: "lg" | "sm"; label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/rework", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      const d = await r.json().catch(() => ({ error: r.statusText }));
      if (!r.ok) throw new Error(d.error);
      router.push(target === "mobile" ? `/m/lot/${encodeURIComponent(d.planId)}` : `/inspect?lot=${encodeURIComponent(d.planId)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <span className={size === "lg" ? "block" : "inline-flex flex-col items-start"}>
      <button onClick={go} disabled={busy}
        className={size === "lg" ? "w-full h-14 rounded-xl bg-white border-2 border-fail text-fail text-lg font-bold disabled:opacity-60" : "btn-ghost h-8 !border-fail !text-fail"}>
        {busy ? "Đang mở…" : label}
      </button>
      {err && <span className="block text-sm text-fail mt-1">{err}</span>}
    </span>
  );
}
