import { Card, PageHeader } from "@/components/ui";
import { BrandMapTable, EmailForm, ParamsForm, StoresTable, UsersTable } from "@/components/SettingsEditors";
import { requireUser } from "@/lib/auth";
import ActionButton from "@/components/ActionButton";
import { loadSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

// Sheet Settings (named ranges + tblStores + tblBrandMap) + email + người dùng
export default async function SettingsPage() {
  const me = await requireUser();
  const s = await loadSettings();
  const db = supabaseAdmin();
  const [{ data: stores }, { data: brands }, { data: users }, { data: mails }] = await Promise.all([
    db.from("stores").select("*").order("rows_in_report", { ascending: false }),
    db.from("brand_map").select("*").order("auto_added", { ascending: false }).order("brand_name"),
    me.role === "admin" ? db.from("profiles").select("*").order("created_at") : Promise.resolve({ data: [] }),
    db.from("email_logs").select("*").order("sent_at", { ascending: false }).limit(8),
  ]);
  const canEdit = ["admin", "planner"].includes(me.role);
  const vn = (t: string) => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <>
      <PageHeader title="Cài đặt" sub="Ô nền vàng được phép sửa. Kế hoạch, form nhập và báo cáo đều đọc tham số từ đây." />
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Tham số kiểm ẩm"><ParamsForm s={s} canEdit={canEdit} /></Card>
        <div className="space-y-4">
          <Card title="Email kế hoạch hằng ngày">
            <EmailForm s={s} canEdit={canEdit} />
            {(mails ?? []).length > 0 && (
              <table className="tbl text-xs mt-3">
                <thead><tr><th>Lúc</th><th>Loại</th><th>Trạng thái</th><th>Tiêu đề / lỗi</th><th></th></tr></thead>
                <tbody>{(mails ?? []).map((m, i) => (
                  <tr key={m.id}><td className="whitespace-nowrap">{vn(m.sent_at)}</td><td>{m.kind}</td>
                    <td className={m.status === "ERROR" ? "text-fail font-semibold" : m.status === "SENT" ? "text-pass" : "text-mute"}>{m.status}</td>
                    <td>{m.error ?? m.subject}</td>
                    <td>{canEdit && i === 0 && m.kind === "DAILY" && m.status === "ERROR" && (
                      <ActionButton url="/api/email/test" body={{ now: true }} label="Gửi lại" ghost confirm="Gửi lại email kế hoạch hôm nay cho cả danh sách?"
                        result="resend" />
                    )}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          <Card title="Store – Include = Y sẽ được tính tồn & kiểm ẩm"><StoresTable rows={stores ?? []} canEdit={canEdit} /></Card>
        </div>
        <Card title="Brand map – Brand name (báo cáo kho) → Brand code" className="xl:col-span-2"><BrandMapTable rows={brands ?? []} canEdit={canEdit} /></Card>
        {me.role === "admin" && <Card title="Người dùng & vai trò" className="xl:col-span-2"><UsersTable rows={(users ?? []) as Profile[]} meId={me.id} /></Card>}
      </div>
    </>
  );
}
