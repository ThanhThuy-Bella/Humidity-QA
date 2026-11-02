# 02 – Kiến trúc

```
Điện thoại QA ──QR──► /m/lot/<PlanID> ─┐
Máy tính PPC/QA ─────► các trang (app) ├─► Next.js trên Vercel (region sin1)
Power Automate (mail kho) ─webhook────►│     ├─ Server Components: đọc dữ liệu
Vercel Cron 07:30 T2–T7 ──────────────►┘     ├─ API routes: mọi thao tác GHI (kiểm tra vai trò)
                                             └─ Engine (src/lib/engine) = business rules
                                                     │ service role
                                                     ▼
                                     Supabase: Postgres + Auth + Storage (bucket imports)
```

## Nguyên tắc
- **Trình duyệt chỉ đọc** (RLS `select` cho người đã đăng nhập). Mọi thao tác ghi đi qua API server, kiểm tra vai trò rồi dùng service role → không ai sửa thẳng dữ liệu được.
- File báo cáo kho upload **thẳng từ trình duyệt lên Storage** bằng signed URL → không vướng giới hạn 4,5 MB của Vercel; đọc xong là xóa.
- Engine là hàm thuần (rules.ts) → test được với dữ liệu thật (scripts/test-engine.ts).
- Ngày lưu dạng `yyyy-mm-dd`, “hôm nay” tính theo giờ Việt Nam.

## Vai trò
| Vai trò | Quyền |
|---|---|
| admin | toàn quyền, quản lý người dùng, nạp lịch sử cũ |
| planner | nạp báo cáo kho, lập lại kế hoạch, cài đặt, email |
| qa | nhập số đo, CAPA |
| viewer | chỉ xem, xuất Excel |
Người đăng ký đầu tiên tự thành **admin**.

## Database (supabase/migrations/0001_schema.sql)
| Bảng | Thay cho | Ghi chú |
|---|---|---|
| settings | sheet Settings | 1 dòng |
| stores, brand_map | tblStores, tblBrandMap | |
| warehouse_imports | (mới) | log mỗi lần nạp + thống kê |
| stock_lots | tblLots | ghi đè mỗi lần nạp; `location_pallets` cho dropdown Vị trí → Pallet |
| inspection_plan | tblPlan | OPEN / ARCHIVED / CANCELLED |
| inspection_readings | tblResult | 1 dòng / thùng mẫu, **giữ lại** sau khi đóng lô |
| inspection_history | tblHistory | |
| capa, capa_logs | (mới) | |
| email_logs, activity_log, profiles | (mới) | |
| **v_plan** (view) | cột công thức tblPlan | cartons_tested, max, lot_result, priority… |

## Thời gian xử lý (đo trên dữ liệu thật)
- Đọc báo cáo kho 54.729 dòng: ~3,7 giây. Cả Daily Process (ghi 739 lô, lập kế hoạch): ước tính 15–30 giây, trong giới hạn 60 giây của Vercel.
