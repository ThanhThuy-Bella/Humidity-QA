# 01 – Business rules (port từ VBA)

Tất cả tham số đọc từ bảng `settings` (trang **Cài đặt**), giá trị mặc định = file Excel v4.

## R1. Đọc báo cáo kho (ImportWarehouseReport)
- File `bao-cao_yyyy-mm-dd.xlsx`, sheet `FGs_Report`; 1 dòng = 1 thùng (UCC).
- Dòng tiêu đề tìm trong 5 dòng đầu theo **tên cột** (không phụ thuộc vị trí). Bắt buộc có `Ref no` và `Ucc`.
- Ngày nhận cả kiểu Date, số serial Excel, `yyyy-mm-dd`, `dd/mm/yyyy`.
- Cùng tên file đã nạp → bỏ qua (có ô “Nạp lại” để ép chạy lại).

## R2. Lọc và gom lô (BuildStockLots)
- Chỉ store có **Include = Y**; chỉ **Grade = A** (trống = mọi grade).
- **Lô = Brand Code + JO (Ref no) + Buyer PO.** Cartons = số UCC; Qty = tổng; BPO date và ngày nhập kho = ngày **sớm nhất** trong lô.
- Brand Code lấy từ Brand map; brand mới → tiền tố Style no trước dấu “-”, tự thêm vào Brand map (nền vàng, cần xem lại).
- **Store mới** xuất hiện → mặc định **không tính** (Include = N), chờ duyệt. *(Khác VBA – xem 06.)*

## R3. Đánh giá lô theo ngày lập kế hoạch (cột O:W tblLots)
| Cột | Công thức |
|---|---|
| Ngày kiểm dự kiến | MAX(Plan date, BPO date − 7) |
| ISO tối thiểu | (tháng của **ngày kiểm** trong 5–10 ? 4 : 6) tuần × 7 |
| Trạng thái BPO | NO BPO · OVERDUE (BPO < hôm nay) · DUE (BPO ≤ 14 ngày tới) · LATER |
| Trigger | Chỉ khi DUE **và** tồn kho tính đến ngày kiểm ≥ ISO: chưa từng kiểm → **PRE-SHIPMENT**; lần kiểm gần nhất trước BPO mới > 7 ngày → **RE-INSPECT (new BPO)**; ngược lại không kiểm |
| Ưu tiên | Plan date > BPO − 5 → **Trễ hạn**, ngược lại Đúng hạn |

- Lô đã quá BPO date: **không** lập kế hoạch (chờ BPO date mới).
- Quy tắc 23/26 tuần đã bỏ.

## R4. Lập kế hoạch (GenerateHumidityPlan)
1. Lô kế hoạch **chưa có số đo**: hết hàng trong kho hoặc hết Trigger → **hủy** (giữ lý do); BPO date đổi → **dời lịch**.
2. Lô có Trigger mà chưa có kế hoạch mở → tạo mới, mã `HI-yymmdd-###`.
3. Mỗi lô tạo **ROUNDUP(Cartons × 2%)** dòng thùng mẫu (tối thiểu 1), mỗi thùng đo **3 áo**.
- Vị trí/Pallet của lô đang mở được cập nhật theo báo cáo kho mới nhất.

## R5. Kết quả (công thức tblResult / tblPlan)
- Thùng: Max(3 số đo) ≤ **6,5%** → PASS; > 6,5% → FAIL.
- Lô: có ≥ 1 thùng FAIL → **FAIL**; đủ số thùng mẫu đo đủ 3 số → **PASS**; có số đo → Đang kiểm; chưa có → Chờ kiểm.
- Ngày kiểm không được sau hôm nay (và không trước 14 ngày).
- Lô PASS/FAIL **và** đủ số thùng mẫu → tự **đóng**, ghi 1 dòng Lịch sử (định dạng giống HUMIDITY_REPORT: `4.0/4.5/4.0 | …`, Max, TB, OK/UNDER).
- FAIL chưa có độ ẩm sau tái chế → Nguồn = `SYSTEM - CAPA/REWORK REQUIRED` và **tự tạo phiếu CAPA**.

## R6. CAPA (mới)
- Tự tạo khi lô FAIL; tạo tay từ Lịch sử (cả lô LEGACY).
- Đóng phiếu bắt buộc: nguyên nhân gốc + hành động khắc phục + độ ẩm sau tái chế ≤ 6,5%.
- Độ ẩm sau tái chế ghi ngược về Lịch sử, bỏ cờ “CAPA/REWORK REQUIRED”.

## R7. Nạp lịch sử cũ (ImportLegacyHumidityReport)
- Tìm tiêu đề “Audit carton no” trong 12 dòng đầu; số đo = các cột giữa “Actual humidity” và “Result”; “4,5” = 4.5.
- PASS/FAIL tính lại theo ngưỡng hiện tại; bỏ dòng trùng (ngày + JO + BPO); mã `LEG-yymmdd-###`.

## R8. Kiểm lại sau tái chế (mới – 21/10/2026)
- Lô FAIL đã đóng → nút **Nhập kiểm lại sau tái chế** (màn hình kết quả của công nhân, trang lô đã đóng, Lịch sử, phiếu CAPA).
- Tạo lượt kiểm lại `<PlanID gốc>-R1, -R2…`, ngày kiểm = hôm nay, gồm **toàn bộ thùng mẫu** của lô gốc (điền sẵn vị trí / pallet / số thùng / SL áo) – áp dụng cho mọi lần kiểm lại.
- Mỗi lô gốc chỉ có 1 lượt kiểm lại đang mở. Kế hoạch hằng ngày không hủy / dời lượt kiểm lại.
- Đo lại **ĐẠT** (max ≤ 6,5%): ghi max vào *độ ẩm sau tái chế* của lô gốc trong Lịch sử, bỏ cờ CAPA/REWORK REQUIRED, CAPA → Chờ xác nhận.
- **Vẫn FAIL** (≥ 1 thùng > 6,5%): CAPA → Đang xử lý, nút kiểm lại vẫn còn (lần sau lại đo toàn bộ thùng mẫu).
- Lượt kiểm lại **không** tạo dòng Lịch sử riêng (không làm sai tỷ lệ PASS/FAIL); số đo được lưu, ghi chú vào cột Trigger của lô gốc và nhật ký CAPA.
- Lô LEGACY (nhập từ HUMIDITY_REPORT cũ) không có số đo từng thùng → nhập độ ẩm tái chế tay trong phiếu CAPA.
