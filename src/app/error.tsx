"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-6 max-w-md">
        <h1 className="text-lg font-bold text-fail mb-2">Có lỗi khi tải trang</h1>
        <p className="text-sm text-mute mb-3">{error.message || "Lỗi không xác định"}{error.digest ? ` (mã ${error.digest})` : ""}</p>
        <button className="btn" onClick={reset}>Thử lại</button>
      </div>
    </main>
  );
}
