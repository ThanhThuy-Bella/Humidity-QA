import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Thêm / sửa brand map – áp dụng từ lần nạp báo cáo kho kế tiếp */
export const PUT = handle(async (req: Request) => {
  await requireRole(CAN_PLAN);
  const { brand_name, brand_code, note } = (await req.json()) as { brand_name: string; brand_code: string; note?: string };
  if (!brand_name?.trim() || !brand_code?.trim()) throw new Error("Cần Brand name và Brand code");
  const { error } = await supabaseAdmin().from("brand_map").upsert({
    brand_name: brand_name.trim(), brand_code: brand_code.trim(), note: note ?? "Sửa tay", auto_added: false, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  await requireRole(CAN_PLAN);
  const { brand_name } = (await req.json()) as { brand_name: string };
  const { error } = await supabaseAdmin().from("brand_map").delete().eq("brand_name", brand_name);
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true });
});
