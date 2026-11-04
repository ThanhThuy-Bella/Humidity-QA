import Link from "next/link";
import { requireUser, displayName } from "@/lib/auth";
import { initials } from "@/lib/mobileUi";

export const dynamic = "force-dynamic";

// Mobile Inspection – giao diện cho công nhân / QA tại kho (điện thoại)
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const name = displayName(me);
  return (
    <div className="min-h-screen max-w-xl mx-auto bg-[#F1F5F8]">
      <header className="sticky top-0 z-20 bg-teal-dark text-white px-4 h-16 flex items-center justify-between shadow-md">
        <Link href="/m" className="flex items-center gap-2.5 font-bold text-lg">
          <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#7DD3FC" stroke="#fff" strokeWidth="1.6"><path d="M12 2.7c3.5 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.8 6-11z" /></svg>
          </span>
          Kiểm ẩm
        </Link>
        <div className="flex items-center gap-2.5">
          <Link href="/m/scan" className="h-10 px-4 rounded-xl bg-[#FACC15] text-[#422006] font-bold flex items-center gap-1.5 shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
            Quét QR
          </Link>
          <span className="w-10 h-10 rounded-full bg-[#7DD3FC] text-[#0C4A6E] font-bold flex items-center justify-center text-sm" title={name} aria-label={`Người dùng ${name}`}>{initials(name)}</span>
        </div>
      </header>
      <main className="p-3 pb-24">{children}</main>
    </div>
  );
}
