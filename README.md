# Humidity Inspection System – Web (THV / EHV FG Warehouse)

Thay thế hoàn toàn file `Humidity_Inspection_System_FINAL_v4.xlsm`.
Next.js 15 · TypeScript · Tailwind · Supabase (Postgres + Auth + Storage) · Vercel.

## Bắt đầu nhanh
1. Đọc **docs/05-trien-khai.md** – làm theo từng bước (không cần cài gì trên máy).
2. Sau khi deploy, mở `https://<app>/api/health` → phải thấy `"ok": true`.
3. QA: đọc **docs/07-huong-dan-qa-dien-thoai.md**.

## Thư mục
| Đường dẫn | Nội dung |
|---|---|
| `supabase/migrations/0001_schema.sql` | Toàn bộ database (13 bảng, view `v_plan`, RLS, bucket). Chạy 1 lần (chạy lại an toàn). |
| `supabase/migrations/0002_auto_mail.sql` | v1.4 – chỉ chạy nếu DB đã tạo bằng 0001 bản cũ. |
| `supabase/seed.sql` | Dữ liệu chuyển từ file Excel v4 (Settings, 11 store, 30 brand, 279 lịch sử, 739 lô tồn, 51 lô kế hoạch + 202 thùng mẫu). |
| `src/lib/engine/` | Business rules port từ VBA: đọc báo cáo kho, gom lô, lập kế hoạch, lưu số đo, đóng lô, CAPA, nạp lịch sử cũ. |
| `src/lib/email/` | Email Daily Plan (nội dung + gửi SMTP/Resend). |
| `src/app/(app)/` | Màn hình máy tính (tương ứng từng sheet VBA). |
| `src/app/m/` | Mobile Inspection (QR). |
| `src/app/api/` | API: import, webhook mail kho, lưu số đo, export Excel, QR, cron, email, CAPA, cài đặt, health. |
| `scripts/` | Kiểm chứng engine với dữ liệu thật, sinh seed.sql, dựng thử email. |
| `docs/` | Tài liệu tiếng Việt. |

## Lệnh (chỉ cần nếu muốn chạy trên máy)
```bash
npm install
cp .env.example .env.local      # điền khóa Supabase
npm run dev                     # http://localhost:3000
npm run typecheck && npm run build
npx tsx scripts/test-engine.ts bao-cao_2026-10-19.xlsx fixture.json 2026-10-19
```
