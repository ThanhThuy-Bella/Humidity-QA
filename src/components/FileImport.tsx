"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { DailyProcessResult } from "@/lib/types";

/** Upload file → Supabase Storage (signed URL) → API xử lý. warehouse = Daily Process ; legacy = HUMIDITY_REPORT cũ */
export default function FileImport({ mode }: { mode: "warehouse" | "legacy" }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [res, setRes] = useState<DailyProcessResult | { imported: number } | null>(null);

  async function run() {
    if (!file) return;
    setErr(""); setRes(null);
    try {
      setBusy("Đang tải file lên…");
      const s = await fetch("/api/import/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name }) });
      const sd = await s.json();
      if (!s.ok) throw new Error(sd.error);
      const up = await supabaseBrowser().storage.from("imports").uploadToSignedUrl(sd.path, sd.token, file);
      if (up.error) throw new Error(up.error.message);
      setBusy(mode === "warehouse" ? "Đang đọc báo cáo kho & lập kế hoạch… (20–50 giây)" : "Đang nạp dữ liệu cũ…");
      const url = mode === "warehouse" ? "/api/import/process" : "/api/legacy-import";
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: sd.path, fileName: file.name, force }) });
      const d = await r.json().catch(() => ({ error: `Lỗi máy chủ (${r.status}) – có thể quá thời gian xử lý` }));
      if (!r.ok) throw new Error(d.error);
      setRes(d);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const d = res && "fileName" in res ? res : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" aria-label="Chọn file" />
        {mode === "warehouse" && (
          <label className="text-sm flex items-center gap-1.5"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Nạp lại dù trùng tên file</label>
        )}
        <button className="btn" disabled={!file || !!busy} onClick={run}>{mode === "warehouse" ? "Cập nhật báo cáo kho" : "Nạp lịch sử cũ"}</button>
      </div>
      {busy && <p className="text-sm text-teal-dark mt-3">{busy}</p>}
      {err && <p className="text-sm text-fail mt-3">{err}</p>}
      {res && "imported" in res && <p className="text-sm text-pass mt-3">Đã nạp {res.imported} dòng (bỏ qua dòng trùng).</p>}
      {d && (d.skipped ? <p className="text-sm text-warn mt-3">{d.message} Tick “Nạp lại” nếu muốn chạy lại.</p> : (
        <div className="mt-4 card p-4 max-w-xl">
          <div className="font-semibold text-teal-dark mb-2">Daily process completed</div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-mute">Báo cáo kho</dt><dd>{d.fileName}</dd>
            <dt className="text-mute">Thùng (UCC) đọc được</dt><dd className="num">{d.cartonsImported.toLocaleString()}</dd>
            <dt className="text-mute">Thùng sau lọc Grade + Store</dt><dd className="num">{d.includedCartons.toLocaleString()}</dd>
            <dt className="text-mute">Lô tồn (JO + Buyer PO)</dt><dd className="num">{d.stockLots}</dd>
            <dt className="text-mute">Lô đóng chuyển Lịch sử</dt><dd className="num">{d.archived}</dd>
            <dt className="text-mute">Lô kiểm mới</dt><dd className="num font-semibold">{d.newTasks}</dd>
            <dt className="text-mute">Dời lịch (BPO date đổi)</dt><dd className="num">{d.rescheduled}</dd>
            <dt className="text-mute">Hủy (đã xuất / hết hạn)</dt><dd className="num">{d.removed}</dd>
            <dt className="text-mute">Dòng thùng mẫu tạo mới</dt><dd className="num">{d.sampleRows}</dd>
          </dl>
          {d.newBrands.length > 0 && <p className="text-sm text-warn mt-2">Brand mới tự thêm (cần xem lại ở Cài đặt): {d.newBrands.join(", ")}</p>}
          {d.newStores.length > 0 && <p className="text-sm text-warn mt-1">Store mới (mặc định không tính tồn): {d.newStores.join(", ")}</p>}
        </div>
      ))}
    </div>
  );
}
