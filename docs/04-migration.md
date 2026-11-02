# 04 – Chuyển dữ liệu & chuyển đổi từ Excel sang Web

## Dữ liệu đã chuyển sẵn (supabase/seed.sql – từ file v4)
| Dữ liệu | Số lượng | Nguồn |
|---|---|---|
| Tham số | 15 tham số | sheet Settings (Plan date **để trống = hôm nay**, file Excel đang cố định 19/10) |
| Store | 11 (3 store Include = Y) | tblStores |
| Brand map | 30 | tblBrandMap |
| Lịch sử kiểm | 279 dòng (gồm LEGACY từ HUMIDITY_REPORT_2026) | tblHistory |
| Tồn kho theo lô | 739 lô | chạy lại engine trên báo cáo `bao-cao_2026-10-19.xlsx` trong file |
| Kế hoạch đang mở | 51 lô, 202 thùng mẫu | tblPlan + tblResult (giữ nguyên PlanID `HI-261017-…` để QA làm tiếp) |

Đã kiểm chứng trên PostgreSQL 16: chạy schema + seed thành công, chạy lại lần 2 không lỗi, đếm đúng 11 / 30 / 279 / 739 / 51 / 202.

> Nếu SQL Editor báo câu lệnh quá dài: chạy 3 file trong `supabase/seed-parts/` theo thứ tự 1 → 2 → 3 thay cho seed.sql.

## Kế hoạch chuyển đổi đề xuất
| Ngày | Việc |
|---|---|
| N | Deploy theo docs/05. Kiểm tra `/api/health`. Mở `/stock` so với sheet Stock_Lots (739 lô), `/plan` so với Humidity_Plan (51 lô). |
| N | Nạp báo cáo kho mới nhất (vd `bao-cao_2026-10-20.xlsx`) ở `/import` → kế hoạch cập nhật theo ngày hôm nay. |
| N+1 → N+4 | **Chạy song song phần lập kế hoạch**: mỗi sáng so danh sách lô cần kiểm của web với file Excel. QA **chỉ nhập trên web** (tránh nhập 2 lần). |
| N+5 | Nếu khớp: tắt AutoRunOnOpen trong Excel, lưu file Excel làm bản lưu trữ (chỉ đọc). Bật email tự động. |

## Lưu ý
- Số đo nhập vào Excel **sau** khi xuất file v4 (nếu có) cần nhập lại trên web.
- Brand/Store mới sau ngày 19/10 sẽ tự xuất hiện khi nạp báo cáo kho – vào Cài đặt duyệt.
- Muốn chuyển lại dữ liệu từ một file Excel mới hơn: gửi file, sinh lại seed bằng `scripts/make-seed.ts`.
