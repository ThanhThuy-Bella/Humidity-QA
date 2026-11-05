// Nội dung mặc định của email kế hoạch (dùng khi database chưa chạy 0003_email_text.sql)
export const EMAIL_DEFAULTS = {
  subject: "[Kiểm ẩm] Kế hoạch {ngay} – {so_lo} lô cần kiểm ({so_tre} trễ hạn)",
  intro: "Chào các anh chị,\nHệ thống gửi kế hoạch kiểm ẩm hôm nay. Kho vui lòng hạ thùng mẫu theo quy trình, QA đo 3 áo/thùng và nhập kết quả trên app điện thoại.",
  signature: "Trân trọng,\nPPC – Tessellation Hòa Bình",
};

export const EMAIL_VARS: [string, string][] = [
  ["{ngay}", "ngày gửi (05/11/2026)"],
  ["{so_lo}", "số lô cần kiểm hôm nay"],
  ["{so_tre}", "số lô trễ hạn"],
  ["{ngay_mai}", "ngày kiểm kế tiếp"],
  ["{so_lo_mai}", "số lô ngày kế tiếp"],
];

export function fillVars(tpl: string, v: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
}
