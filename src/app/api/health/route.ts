import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { smtpConfig } from "@/lib/email/dailyPlan";

export const dynamic = "force-dynamic";

/** Kiểm tra sau deploy: biến môi trường + kết nối Supabase + đã chạy schema/seed chưa */
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
    CRON_SECRET: !!process.env.CRON_SECRET,
    IMPORT_WEBHOOK_SECRET: !!process.env.IMPORT_WEBHOOK_SECRET,
    EMAIL: false,
  };
  const mail = await smtpConfig().catch(() => null);
  env.EMAIL = !!mail;
  let db: Record<string, unknown> = {};
  try {
    const a = supabaseAdmin();
    const [s, h, st, b] = await Promise.all([
      a.from("settings").select("id").eq("id", 1).maybeSingle(),
      a.from("inspection_history").select("plan_id", { count: "exact", head: true }),
      a.from("stores").select("store_name", { count: "exact", head: true }),
      a.storage.getBucket("imports"),
    ]);
    db = { schema: !s.error && !!s.data, history_rows: h.count ?? null, stores: st.count ?? null, bucket_imports: !b.error, error: s.error?.message };
  } catch (e) {
    db = { error: e instanceof Error ? e.message : String(e) };
  }
  const ok = Object.values(env).every(Boolean) && db.schema === true && db.bucket_imports === true;
  return NextResponse.json({ ok, env, db, mail: mail ? { source: mail.source, host: mail.host } : null }, { status: ok ? 200 : 503 });
}
