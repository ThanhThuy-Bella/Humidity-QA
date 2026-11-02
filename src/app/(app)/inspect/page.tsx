import Link from "next/link";
import { PageHeader, Empty } from "@/components/ui";
import LotPicker from "@/components/LotPicker";
import InspectionEntry from "@/components/InspectionEntry";
import { displayName, requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { openPlans } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayVN } from "@/lib/dates";
import { lotOptions, toNum } from "@/lib/lotOptions";
import type { ReadingRow } from "@/lib/types";

type SP = Promise<{ lot?: string }>;

// Sheet "Nhap" – Nhập kết quả kiểm ẩm
export default async function InspectPage({ searchParams }: { searchParams: SP }) {
  const { lot } = await searchParams;
  const me = await requireUser();
  const s = await loadSettings();
  const plans = await openPlans();
  const plan = lot ? plans.find((p) => p.plan_id === lot) : undefined;
  let readings: ReadingRow[] = [];
  if (plan) {
    const { data } = await supabaseAdmin().from("inspection_readings").select("*").eq("plan_id", plan.plan_id).order("sample_no");
    readings = ((data ?? []) as ReadingRow[]).map((r) => ({ ...r, r1: toNum(r.r1), r2: toNum(r.r2), r3: toNum(r.r3), carton_max: toNum(r.carton_max) }));
  }
  return (
    <>
      <PageHeader title="Nhập kết quả kiểm ẩm" sub="Chọn lô → chọn Vị trí, Pallet theo thùng kho đã hạ → gõ số thùng, SL áo và 3 số đo (3 cái áo)" />
      <div className="mb-4 no-print">
        <LotPicker options={lotOptions(plans)} value={plan?.plan_id} />
        <p className="text-xs text-mute mt-1">Lô trễ hạn xếp lên đầu. Có thể bấm vào JO ở trang Tổng quan hoặc quét QR trên biểu mẫu để mở thẳng lô.</p>
      </div>
      {lot && !plan && <Empty>Không tìm thấy lô {lot} trong kế hoạch (có thể đã đóng). <Link className="underline" href={`/history?q=${encodeURIComponent(lot)}`}>Xem Lịch sử</Link></Empty>}
      {plan && (
        <InspectionEntry key={plan.plan_id} plan={plan} readings={readings} limit={s.hum_limit} perCarton={s.readings_per_carton}
          today={todayVN()} defaultQa={displayName(me)} canEdit={["admin", "planner", "qa"].includes(me.role)} />
      )}
      {!lot && <Empty>Chưa chọn lô.</Empty>}
    </>
  );
}
