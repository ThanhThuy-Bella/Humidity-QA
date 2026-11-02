"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return setErr("Sai email hoặc mật khẩu.");
    const next = sp.get("next") || "/";
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input w-full h-11" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="pw">Mật khẩu</label>
        <input id="pw" className="input w-full h-11" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </div>
      {err && <p className="text-sm text-fail" role="alert">{err}</p>}
      <button className="btn w-full h-11" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid md:grid-cols-[380px_1fr]">
      <section className="bg-teal text-white p-8 md:p-10 flex flex-col justify-between">
        <div>
          <div className="text-2xl font-bold">Quản lý kiểm ẩm</div>
          <div className="text-sm opacity-90 mt-1">Kho thành phẩm EHV · THV</div>
        </div>
        <p className="text-sm text-teal-soft hidden md:block max-w-[30ch]">
          Kế hoạch kiểm ẩm tự lập từ báo cáo kho hằng ngày. QA quét QR trên biểu mẫu để nhập số đo ngay tại kho.
        </p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="card w-full max-w-sm p-6">
          <h1 className="text-xl font-bold text-teal-dark mb-5">Đăng nhập</h1>
          <Suspense><LoginForm /></Suspense>
        </div>
      </section>
    </main>
  );
}
