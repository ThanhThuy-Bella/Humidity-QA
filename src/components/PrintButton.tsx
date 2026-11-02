"use client";
export default function PrintButton({ label = "In / Lưu PDF" }: { label?: string }) {
  return <button className="btn" onClick={() => window.print()}>{label}</button>;
}
