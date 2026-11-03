import { Card, PageHeader } from "@/components/ui";
import FileImport from "@/components/FileImport";
import ActionButton from "@/components/ActionButton";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/dates";

// Thay cho: "Cập nhật báo cáo kho", "Kiểm tra mail kho", "Chọn file báo cáo khác", "Import Legacy Report"
export default async function ImportPage() {
  const me = await requireUser();
  const s = await loadSettings();
  const { data: imports } = await supabaseAdmin().from("warehouse_imports").select("*").order("imported_at", { ascending: false }).limit(15);
  const canPlan = ["admin", "planner"].includes(me.role);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const vnTime = (t: string) => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <>
      <PageHeader title="Cập nhật báo cáo kho"
        sub={<>Báo cáo đang dùng: <b>{s.last_imported_file ?? "chưa có"}</b>{s.last_import_time && <> · nạp lúc {vnTime(s.last_import_time)}</>}</>} />
      <div className="grid xl:grid-cols-[3fr_2fr] gap-4 mb-6">
        <Card title="Nạp báo cáo kho (bao-cao_yyyy-mm-dd.xlsx)">
          {canPlan ? <FileImport mode="warehouse" /> : <p className="text-mute">Cần vai trò planner/admin.</p>}
          <p className="text-xs text-mute mt-3">
            Hệ thống đọc sheet <b>{s.warehouse_sheet}</b>, tìm cột theo tên (Ref no, Ucc, Buyer po, …), chỉ lấy Grade {s.grade_filter || "mọi"} và store được tính,
            gom lô theo Brand + JO + Buyer PO rồi lập kế hoạch. File chỉ dùng tạm và bị xóa sau khi đọc.
          </p>
        </Card>
        <Card title="Tự động từ mail kho">
          <p className="text-sm">Mail <b>“{s.mail_subject} …”</b> được Power Automate chuyển thẳng về hệ thống – không cần mở Outlook.</p>
          <p className="text-xs text-mute mt-2 break-all">Webhook: <code>{appUrl}/api/import/webhook</code></p>
          <p className="text-xs text-mute mt-1">Hướng dẫn cài flow: docs/05-trien-khai.md, mục 7.</p>
          {canPlan && <div className="mt-3"><ActionButton url="/api/plan/regenerate" ghost label="Lập lại kế hoạch (không cần file mới)"
            result="plan" /></div>}
        </Card>
      </div>
      <h2 className="text-lg font-semibold text-teal-dark mb-2">Các lần nạp gần đây</h2>
      <div className="card overflow-x-auto mb-6">
        <table className="tbl">
          <thead><tr><th>Lúc</th><th>File</th><th>Ngày báo cáo</th><th>Nguồn</th><th className="num">UCC</th><th className="num">Sau lọc</th><th className="num">Lô</th><th className="num">Lô mới</th><th className="num">Dời</th><th className="num">Hủy</th></tr></thead>
          <tbody>{(imports ?? []).map((i) => (
            <tr key={i.id}>
              <td>{vnTime(i.imported_at)}</td><td>{i.file_name}</td><td>{fmtDate(i.report_date)}</td>
              <td>{i.source === "webhook" ? "Mail tự động" : i.source === "seed" ? "Chuyển từ Excel" : "Tải lên"}</td><td className="num">{i.carton_rows?.toLocaleString()}</td>
              <td className="num">{i.included_rows?.toLocaleString()}</td><td className="num">{i.lot_count}</td>
              <td className="num">{i.stats?.newTasks ?? ""}</td><td className="num">{i.stats?.rescheduled ?? ""}</td><td className="num">{i.stats?.removed ?? ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {me.role === "admin" && (
        <Card title="Nạp lịch sử cũ (HUMIDITY_REPORT_*.xlsx – layout Sheet1)">
          <FileImport mode="legacy" />
          <p className="text-xs text-mute mt-2">Tìm cột theo tiêu đề; số đo là các cột giữa “Actual humidity” và “Result”; “4,5” đổi thành 4.5; PASS/FAIL tính lại theo {s.hum_limit}%; bỏ dòng trùng (ngày + JO + BPO).</p>
        </Card>
      )}
    </>
  );
}
