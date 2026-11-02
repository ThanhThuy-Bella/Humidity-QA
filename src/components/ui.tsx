import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[26px] font-bold text-teal-dark leading-tight">{title}</h1>
        {sub && <div className="text-sm text-mute mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

const RESULT_STYLE: Record<string, string> = {
  PASS: "bg-pass-bg text-pass", FAIL: "bg-fail-bg text-fail", "IN PROGRESS": "bg-prog-bg text-teal-dark",
  PENDING: "bg-[#F1F4F6] text-mute", "NO DATA": "bg-[#F1F4F6] text-mute",
};
const RESULT_VN: Record<string, string> = { PASS: "PASS", FAIL: "FAIL", "IN PROGRESS": "Đang kiểm", PENDING: "Chờ kiểm", "NO DATA": "Không số đo" };

export function ResultBadge({ r }: { r: string | null | undefined }) {
  if (!r) return null;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${RESULT_STYLE[r] ?? "bg-[#F1F4F6]"}`}>{RESULT_VN[r] ?? r}</span>;
}

export function Priority({ p }: { p: string | null | undefined }) {
  if (p === "LATE") return <span className="text-fail font-semibold whitespace-nowrap">Trễ hạn</span>;
  if (p === "ON TIME") return <span className="text-pass whitespace-nowrap">Đúng hạn</span>;
  if (p === "DONE") return <span className="text-mute">Xong</span>;
  return null;
}

export function TriggerText({ t }: { t: string | null | undefined }) {
  if (t === "PRE-SHIPMENT") return <>Kiểm trước xuất</>;
  if (t?.startsWith("RE-INSPECT")) return <>Kiểm lại (BPO mới)</>;
  if (t === "REWORK") return <span className="text-fail">Kiểm lại sau tái chế</span>;
  return <>{t}</>;
}

export function KV({ label, value, tone }: { label: string; value: ReactNode; tone?: "pass" | "fail" | "warn" }) {
  const c = tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[#F0F3F5] last:border-0">
      <span className="text-mute">{label}</span>
      <span className={`font-semibold tabular-nums ${c}`}>{value}</span>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      {title && <h2 className="card-title mb-2">{title}</h2>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-mute py-8 text-center">{children}</div>;
}

export function ExportLink({ href, children = "Xuất Excel" }: { href: string; children?: ReactNode }) {
  return <a href={href} className="btn-ghost">{children}</a>;
}
