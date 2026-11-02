import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import type { Profile, Role } from "./types";

export async function getProfile(): Promise<Profile | null> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: p } = await supabaseAdmin().from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return (p as Profile) ?? { id: data.user.id, email: data.user.email ?? null, full_name: null, role: "viewer" };
}

/** Dùng trong Server Component: chưa đăng nhập → /login */
export async function requireUser(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  return p;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Dùng trong API route: kiểm tra vai trò, ném 401/403 */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const p = await getProfile();
  if (!p) throw new HttpError(401, "Chưa đăng nhập – vui lòng đăng nhập lại");
  if (!roles.includes(p.role)) throw new HttpError(403, "Không có quyền thực hiện thao tác này");
  return p;
}

export const CAN_PLAN: Role[] = ["admin", "planner"];
export const CAN_INSPECT: Role[] = ["admin", "planner", "qa"];
export const ADMIN: Role[] = ["admin"];
export const ANY: Role[] = ["admin", "planner", "qa", "viewer"];

export function displayName(p: Profile): string {
  return p.full_name || p.email || "user";
}
