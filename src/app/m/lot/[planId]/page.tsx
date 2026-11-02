import Link from "next/link";
import InspectionEntry from "@/components/InspectionEntry";
import WorkerEntry from "@/components/WorkerEntry";
import ReworkButton from "@/components/ReworkButton";
import { displayName, requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normPlan } from "@/lib/queries";
import { todayVN, fmtDate } from "@/lib/dates";
import { toNum } from "@/lib/lotOptions";
import type { PlanView, ReadingRow } from "@/lib/types";

export default async function MobileLot({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ full?: string }> }) {
  const { planId } = await params;
  const { full } = await searchParams;
  const id = decodeURIComponent(planId).toUpperCase();
  const me = await requireUser();
  const s = await loadSettings();
  const db = supabaseAdmin();
  const { data: p } = await db.from("v_plan").select("*").eq("plan_id", id).maybeSingle();
  if (!p) return <p className="text-center py-10">Không tìm thấy lô {id}. <Link className="underline" href="/m">Về danh sách</Link></p>;
  const plan = normPlan(p as PlanView);
  if (plan.status !== "OPEN") {
    const { data: h } = await db.from("inspection_history").select("result,inspection_date,max_humidity").eq("plan_id", id).maybeSingle();
    return (
      <div className="bg-white border border-line rounded-md p-4 text-center">
        <div className="font-bold text-teal-dark">{plan.jo} / {plan.buyer_po}</div>
        <p className="mt-2">Lô đã {plan.status === "ARCHIVED" ? "đóng" : "hủy"}{h ? `: ${h.result} ngày ${fmtDate(h.inspection_date)}, max ${h.max_humidity}%` : ""}.</p>
        {plan.cancel_reason && <p className="text-sm text-mute">{plan.cancel_reason}</p>}
        {plan.final_result === "FAIL" && ["admin", "planner", "qa"].includes(me.role) && (
          <div className="mt-4"><ReworkButton planId={plan.kind === "REWORK" ? plan.parent_plan_id! : plan.plan_id} /></div>
        )}
        <Link href="/m" className="btn mt-4">Về danh sách</Link>
      </div>
    );
  }
  const { data: rd } = await db.from("inspection_readings").select("*").eq("plan_id", id).order("sample_no");
  const readings = ((rd ?? []) as ReadingRow[]).map((r) => ({ ...r, r1: toNum(r.r1), r2: toNum(r.r2), r3: toNum(r.r3), carton_max: toNum(r.carton_max) }));
  const canEdit = ["admin", "planner", "qa"].includes(me.role);
  // mặc định: form từng bước cho công nhân ; ?full=1: bảng đầy đủ cho QA (tái chế, ghi chú, sửa ngày)
  if (!full && canEdit) {
    return <WorkerEntry plan={plan} readings={readings} limit={s.hum_limit} today={todayVN()} defaultName={displayName(me)} />;
  }
  return (
    <>
      <div className="flex justify-between mb-2 text-sm">
        <Link href="/m" className="text-teal-dark underline">← Danh sách lô</Link>
        {canEdit && <Link href={`/m/lot/${encodeURIComponent(id)}`} className="text-teal-dark underline">Form công nhân</Link>}
      </div>
      <InspectionEntry plan={plan} readings={readings} limit={s.hum_limit} perCarton={s.readings_per_carton}
        today={todayVN()} defaultQa={displayName(me)} mobile canEdit={canEdit} />
    </>
  );
}
