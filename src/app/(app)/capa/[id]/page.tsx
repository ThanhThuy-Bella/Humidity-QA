import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, KV, PageHeader } from "@/components/ui";
import CapaForm from "@/components/CapaForm";
import ReworkButton from "@/components/ReworkButton";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/dates";
import { pct } from "@/lib/format";
import type { Capa, ReadingRow } from "@/lib/types";

export default async function CapaDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await requireUser();
  const s = await loadSettings();
  const db = supabaseAdmin();
  const { data } = await db.from("capa").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const capa = { ...data, max_humidity: data.max_humidity === null ? null : Number(data.max_humidity), rework_humidity: data.rework_humidity === null ? null : Number(data.rework_humidity) } as Capa;
  const pid = capa.history_plan_id ?? capa.plan_id;
  const [{ data: logs }, { data: rd }] = await Promise.all([
    db.from("capa_logs").select("*").eq("capa_id", id).order("at", { ascending: false }),
    pid ? db.from("inspection_readings").select("*").eq("plan_id", pid).order("sample_no") : Promise.resolve({ data: [] }),
  ]);
  const readings = (rd ?? []) as ReadingRow[];

  return (
    <>
      <PageHeader title={capa.capa_no} sub={<><Link href="/capa" className="underline">CAPA</Link> · {capa.jo} / {capa.buyer_po} · {capa.brand_code}</>} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card><CapaForm capa={capa} limit={s.hum_limit} canEdit={["admin", "planner", "qa"].includes(me.role)} /></Card>
        <div className="space-y-4">
          <Card title="Lô liên quan">
            <KV label="PlanID" value={pid ?? "—"} />
            <KV label="Ngày kiểm" value={fmtDate(capa.inspection_date)} />
            <KV label="Max độ ẩm" value={pct(capa.max_humidity)} tone="fail" />
            <KV label="Ngưỡng" value={`${capa.hum_limit ?? s.hum_limit}%`} />
            <KV label="Thùng FAIL" value={capa.failed_cartons ?? "—"} />
            {pid && <Link className="text-sm underline text-teal-dark" href={`/history?q=${encodeURIComponent(pid)}`}>Xem trong Lịch sử</Link>}
            {pid?.startsWith("HI-") && !["CLOSED", "CANCELLED"].includes(capa.status) && ["admin", "planner", "qa"].includes(me.role) && (
              <div className="mt-3"><ReworkButton planId={pid} target="desk" size="sm" label="Nhập kiểm lại sau tái chế" /></div>
            )}
          </Card>
          {readings.length > 0 && (
            <Card title="Số đo từng thùng mẫu">
              <table className="tbl text-xs">
                <thead><tr><th>#</th><th>Vị trí/Pallet</th><th>Thùng</th><th className="num">Áo 1–3</th></tr></thead>
                <tbody>{readings.map((r) => (
                  <tr key={r.id} className={Number(r.carton_max) > s.hum_limit ? "text-fail font-semibold" : ""}>
                    <td>{r.sample_no}</td><td>{r.location}/{r.pallet}</td><td>{r.audit_carton_no}</td>
                    <td className="num">{[r.r1, r.r2, r.r3].filter((x) => x !== null).map(Number).join(" / ")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          )}
          <Card title="Nhật ký">
            <ul className="text-xs space-y-2">
              {(logs ?? []).map((l) => (
                <li key={l.id}><div className="font-semibold">{l.action}</div>
                  <div className="text-mute">{new Date(l.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {l.user_name ?? "hệ thống"}</div>
                  {l.note && <div>{l.note}</div>}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
