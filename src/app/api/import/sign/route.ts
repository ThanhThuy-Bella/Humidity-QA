import { NextResponse } from "next/server";
import { CAN_PLAN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Cấp signed upload URL → trình duyệt upload thẳng lên Supabase Storage (không vướng giới hạn 4.5MB của Vercel) */
export const POST = handle(async (req: Request) => {
  await requireRole(CAN_PLAN);
  const { fileName } = (await req.json()) as { fileName: string };
  if (!/\.xls[xm]?$/i.test(fileName ?? "")) throw new Error("Chỉ nhận file Excel (.xlsx)");
  const path = `${Date.now()}_${fileName.replace(/[^\w.\-]/g, "_")}`;
  const { data, error } = await supabaseAdmin().storage.from("imports").createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return NextResponse.json({ path, token: data.token });
});
