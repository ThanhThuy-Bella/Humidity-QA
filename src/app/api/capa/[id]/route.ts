import { NextResponse } from "next/server";
import { CAN_INSPECT, displayName, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { numVal } from "@/lib/format";
import { loadSettings } from "@/lib/settings";

const TXT = ["problem", "root_cause", "containment", "corrective_action", "preventive_action", "owner", "verification"] as const;
const FLOW = ["OPEN", "IN_PROGRESS", "VERIFICATION", "CLOSED", "CANCELLED"];

export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireRole(CAN_INSPECT);
  const { id } = await ctx.params;
  const b = (await req.json()) as Record<string, unknown> & { comment?: string };
  const db = supabaseAdmin();
  const { data: cur } = await db.from("capa").select("*").eq("id", id).single();
  if (!cur) throw new Error("Không tìm thấy CAPA");
  const s = await loadSettings();

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of TXT) if (k in b && String(b[k] ?? "").trim() !== String(cur[k] ?? "")) upd[k] = String(b[k] ?? "").trim() || null;
  if ("due_date" in b && (b.due_date || null) !== cur.due_date) upd.due_date = b.due_date || null;
  if ("rework_humidity" in b) {
    const rw = numVal(b.rework_humidity);
    if (rw !== (cur.rework_humidity === null ? null : Number(cur.rework_humidity))) upd.rework_humidity = rw;
  }
  if (b.status && b.status !== cur.status) {
    if (!FLOW.includes(String(b.status))) throw new Error("Trạng thái không hợp lệ");
    if (b.status === "CLOSED") {
      const rc = (upd.root_cause !== undefined ? upd.root_cause : cur.root_cause) as string | null;
      const ca = (upd.corrective_action !== undefined ? upd.corrective_action : cur.corrective_action) as string | null;
      const rw = (upd.rework_humidity !== undefined ? upd.rework_humidity : cur.rework_humidity) as number | null;
      if (!rc || !ca) throw new Error("Cần điền Nguyên nhân gốc và Hành động khắc phục trước khi đóng CAPA");
      if (rw === null || rw === undefined) throw new Error("Cần nhập độ ẩm sau tái chế trước khi đóng CAPA");
      if (Number(rw) > s.hum_limit) throw new Error(`Độ ẩm sau tái chế ${rw}% vẫn > ${s.hum_limit}% – chưa đóng được`);
      upd.closed_at = new Date().toISOString();
      upd.closed_by = user.id;
    }
    upd.status = b.status;
  }
  const { error } = await db.from("capa").update(upd).eq("id", id);
  if (error) throw new Error(error.message);

  // độ ẩm sau tái chế → đồng bộ về Lịch sử (bỏ cờ CAPA/REWORK REQUIRED)
  const hid = cur.history_plan_id ?? cur.plan_id;
  if (upd.rework_humidity !== undefined && hid) {
    const { data: h } = await db.from("inspection_history").select("source").eq("plan_id", hid).maybeSingle();
    const patch: Record<string, unknown> = { rework_humidity: upd.rework_humidity };
    if (h?.source?.startsWith("SYSTEM")) patch.source = upd.rework_humidity === null ? "SYSTEM - CAPA/REWORK REQUIRED" : "SYSTEM";
    await db.from("inspection_history").update(patch).eq("plan_id", hid);
  }
  const changed = Object.keys(upd).filter((k) => !["updated_at", "closed_at", "closed_by"].includes(k));
  if (changed.length || b.comment) {
    await db.from("capa_logs").insert({
      capa_id: id, user_id: user.id, user_name: displayName(user),
      action: upd.status ? `STATUS → ${upd.status}` : "UPDATE",
      note: [b.comment, changed.length ? `Cập nhật: ${changed.join(", ")}` : ""].filter(Boolean).join(" · "),
    });
  }
  return NextResponse.json({ ok: true });
});
