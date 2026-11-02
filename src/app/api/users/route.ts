import { NextResponse } from "next/server";
import { ADMIN, requireRole } from "@/lib/auth";
import { handle } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ROLES = ["admin", "planner", "qa", "viewer"];

export const PUT = handle(async (req: Request) => {
  const me = await requireRole(ADMIN);
  const { id, role, full_name, password } = (await req.json()) as { id: string; role?: string; full_name?: string; password?: string };
  if (role && !ROLES.includes(role)) throw new Error("Vai trò không hợp lệ");
  if (id === me.id && role && role !== "admin") throw new Error("Không tự hạ quyền admin của chính mình");
  const db = supabaseAdmin();
  const upd: Record<string, unknown> = {};
  if (role) upd.role = role;
  if (full_name !== undefined) upd.full_name = full_name;
  if (Object.keys(upd).length) {
    const { error } = await db.from("profiles").update(upd).eq("id", id);
    if (error) throw new Error(error.message);
  }
  if (password) {
    if (password.length < 8) throw new Error("Mật khẩu ≥ 8 ký tự");
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);
  }
  return NextResponse.json({ ok: true });
});

/** Tạo tài khoản mới (email + mật khẩu tạm) – không cần SMTP của Supabase */
export const POST = handle(async (req: Request) => {
  await requireRole(ADMIN);
  const { email, password, full_name, role } = (await req.json()) as { email: string; password: string; full_name?: string; role?: string };
  if (!email || !password || password.length < 8) throw new Error("Cần email và mật khẩu ≥ 8 ký tự");
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error) throw new Error(error.message);
  if (role && ROLES.includes(role)) await db.from("profiles").update({ role, full_name }).eq("id", data.user.id);
  return NextResponse.json({ ok: true, id: data.user.id });
});
