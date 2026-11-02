import Link from "next/link";
import { requireUser, displayName } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Mobile Inspection – giao diện cho QA tại kho (điện thoại)
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="min-h-screen max-w-xl mx-auto">
      <header className="sticky top-0 z-20 bg-teal text-white px-4 h-14 flex items-center justify-between">
        <Link href="/m" className="font-bold">Kiểm ẩm</Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/m/scan" className="bg-white text-teal-dark font-semibold rounded px-3 py-1.5">Quét QR</Link>
          <span className="opacity-90 truncate max-w-[110px]">{displayName(me)}</span>
        </div>
      </header>
      <main className="p-3 pb-24">{children}</main>
    </div>
  );
}
