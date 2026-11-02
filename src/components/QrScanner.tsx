"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Scanner = { stop: () => Promise<void>; clear: () => void; isScanning?: boolean };

/** Quét QR bằng camera điện thoại (html5-qrcode, chạy được cả iOS Safari – cần HTTPS) */
export default function QrScanner() {
  const router = useRouter();
  const ref = useRef<Scanner | null>(null);
  const done = useRef(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState("");

  function go(text: string) {
    const m = text.match(/\/m\/lot\/([^/?#\s]+)/) ?? text.match(/\b(HI-\d{6}-\d{3,})\b/i);
    const id = m ? decodeURIComponent(m[1]).toUpperCase() : "";
    if (id) {
      if (navigator.vibrate) navigator.vibrate(80);
      router.push(`/m/lot/${encodeURIComponent(id)}`);
    } else setErr(`QR không phải mã lô kiểm ẩm: ${text}`);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext) {
        setErr("Camera chỉ chạy trên trang https. Hãy mở bằng đường link https của hệ thống, hoặc gõ mã lô bên dưới.");
        return;
      }
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const q = new Html5Qrcode("qr-reader");
      ref.current = q as unknown as Scanner;
      try {
        await q.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => {
          if (done.current) return;
          done.current = true;
          q.stop().catch(() => undefined);
          go(text);
        }, () => undefined);
      } catch (e) {
        setErr("Không mở được camera: " + (e instanceof Error ? e.message : String(e)) + ". Hãy cho phép quyền camera trong trình duyệt, hoặc gõ mã lô bên dưới.");
      }
    })();
    return () => {
      cancelled = true;
      const s = ref.current;
      if (s) s.stop().then(() => s.clear()).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div id="qr-reader" className="w-full rounded-md overflow-hidden bg-black min-h-[280px]" />
      {err && <p className="text-sm text-fail mt-2" role="alert">{err}</p>}
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); go(manual.trim()); }}>
        <input className="input h-11 flex-1" placeholder="Hoặc gõ PlanID: HI-261020-001" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" />
        <button className="btn h-11">Mở</button>
      </form>
      <p className="text-xs text-mute mt-3">Có thể quét bằng app Camera mặc định của điện thoại – QR là đường link mở thẳng form nhập của lô.</p>
    </div>
  );
}
