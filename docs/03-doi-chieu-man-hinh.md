# 03 – Đối chiếu màn hình VBA → Web

| VBA (sheet / macro) | Web | Ghi chú |
|---|---|---|
| Home (BuildHome, RefreshHome) | `/` Tổng quan | dải “hôm nay”, 3 thẻ chỉ số, bảng lô cần kiểm, theo khách hàng |
| Nhap (BuildNhap, LoadLot, SaveLotCore) | `/inspect` Nhập kết quả | chọn lô (trễ lên đầu), Vị trí ▼ → Pallet ▼, tự lưu khi đủ 3 số |
| — | `/m`, `/m/scan`, `/m/lot/<PlanID>` | **Mobile Inspection** qua QR |
| Humidity_Plan (tblPlan) | `/plan` Kế hoạch | lọc, tab “Đã hủy”, nút Lập lại kế hoạch |
| Humidity_Result (tblResult) | trong `/inspect` và `/capa/<id>` | |
| Inspection_History | `/history` Lịch sử | lọc, phân trang, tạo CAPA |
| Stock_Lots | `/stock` Tồn kho theo lô | đủ cột O:W |
| Warehouse_Report + RunDailyProcess | `/import` | tải file hoặc mail tự động (webhook) |
| Outlook: LatestMailReportName / SaveMailReport | `/api/import/webhook` + Power Automate | |
| ImportLegacyHumidityReport | `/import` (admin) | |
| Form_Print (BuildInspectionForm, PrintFormPDF) | `/form-print` | thêm cột QR; chế độ **tem QR dán thùng mẫu**; In/PDF, Excel |
| Report (BuildReport, ExportReportPDF) | `/report` | In/PDF, Excel |
| Dashboard + Pivot | `/dashboard` | KPI, theo brand, theo tháng |
| Settings | `/settings` | tham số, email, store, brand map, người dùng |
| Guide | docs/ | |
| — | `/capa`, `/capa/<id>` | **CAPA** (mới) |
| AutoRunOnOpen | Vercel Cron 07:30 + webhook | không cần mở file |

## Xuất Excel (`/api/export/...`)
`plan` · `history` (theo bộ lọc) · `stock` · `form?date=` · `report?from=&to=` · `capa`
