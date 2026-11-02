"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Menu giữ đúng thứ tự & tên như sidebar VBA (DrawSidebar), thêm CAPA
const NAV: { group?: string; items: { href: string; label: string }[] }[] = [
  { items: [
    { href: "/", label: "Tổng quan" },
    { href: "/plan", label: "Kế hoạch kiểm ẩm" },
    { href: "/inspect", label: "Nhập kết quả" },
    { href: "/history", label: "Lịch sử kiểm" },
    { href: "/capa", label: "CAPA" },
  ] },
  { group: "Kho", items: [
    { href: "/stock", label: "Tồn kho theo lô" },
    { href: "/import", label: "Cập nhật báo cáo kho" },
    { href: "/form-print", label: "In biểu mẫu & QR" },
  ] },
  { group: "Quản trị", items: [
    { href: "/report", label: "Báo cáo kỳ" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/settings", label: "Cài đặt" },
  ] },
];

export default function Sidebar({ userName, role }: { userName: string; role: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <div className="md:hidden no-print sticky top-0 z-30 bg-teal text-white flex items-center justify-between px-4 h-12">
        <span className="font-bold">Quản lý kiểm ẩm</span>
        <button className="px-2 py-1 border border-white/40 rounded text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
      </div>
      {open && <div className="md:hidden fixed inset-0 z-30 bg-black/30" onClick={() => setOpen(false)} />}
      <aside className={`no-print bg-teal text-white w-[232px] shrink-0 md:sticky md:top-0 md:h-screen overflow-y-auto flex-col
        ${open ? "flex fixed inset-y-0 left-0 z-40" : "hidden md:flex"}`}>
        <div className="px-5 pt-6 pb-5">
          <div className="text-lg font-bold leading-tight">Quản lý kiểm ẩm</div>
          <div className="text-xs opacity-90">Kho thành phẩm EHV · THV</div>
        </div>
        <nav className="flex-1">
          {NAV.map((g, i) => (
            <div key={i} className="mb-2">
              {g.group && <div className="px-5 pt-3 pb-1 text-xs font-semibold text-teal-soft">{g.group}</div>}
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)}
                  className={`block mr-2.5 pl-5 py-[7px] text-[14px] rounded-r ${active(it.href) ? "bg-white text-teal-dark font-semibold" : "hover:bg-white/10"}`}>
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/20 text-xs">
          <div className="font-semibold truncate">{userName}</div>
          <div className="opacity-80 mb-2">Vai trò: {role}</div>
          <div className="flex gap-3">
            <Link href="/m" className="underline">Bản điện thoại</Link>
            <button onClick={logout} className="underline">Đăng xuất</button>
          </div>
        </div>
      </aside>
    </>
  );
}
