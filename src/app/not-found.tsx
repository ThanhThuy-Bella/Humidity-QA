import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-6 text-center max-w-sm">
        <h1 className="text-xl font-bold text-teal-dark mb-2">Không tìm thấy trang</h1>
        <Link href="/" className="btn mt-2">Về Tổng quan</Link>
      </div>
    </main>
  );
}
