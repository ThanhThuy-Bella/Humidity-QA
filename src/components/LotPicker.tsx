"use client";
import { useRouter } from "next/navigation";

/** Ô "Chọn lô" (dropdown sheet Nhap): lô trễ hạn lên đầu, rồi theo ngày kiểm */
export default function LotPicker({ options, value, base = "/inspect" }: { options: { id: string; label: string; late: boolean }[]; value?: string; base?: string }) {
  const router = useRouter();
  return (
    <select aria-label="Chọn lô" className="input w-full md:w-[520px] h-10 font-semibold border-teal border-2" value={value ?? ""}
      onChange={(e) => router.push(e.target.value ? `${base}?lot=${encodeURIComponent(e.target.value)}` : base)}>
      <option value="">— Chọn lô cần nhập —</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.late ? "  · TRỄ" : ""}</option>)}
    </select>
  );
}
