# PROJECT MEMORY – Humidity Inspection System (Web)

> **Nguồn sự thật (source of truth) của dự án.** Claude ở cuộc trò chuyện mới: đọc file này trước, KHÔNG phân tích lại VBA, KHÔNG hỏi lại chị Ana về dự án.
> Cập nhật lần cuối: **02/11/2026** · Phiên bản: **v1.4** (email tự động 08:00 / sau khi nạp báo cáo kho, ngày gửi T2–T7, báo trước 1 ngày khi có kế hoạch mới, gửi bù 09:00)

---

## 0. Bối cảnh nhanh
- **Chủ dự án:** Ana – Senior Supervisor PPC, Tessellation Hòa Bình (THV, thuộc Esquel). Giao tiếp tiếng Việt, xưng “chị”, Claude xưng “em”. Muốn trả lời ngắn gọn, hành động, **luôn có file thật** để tải.
- **Mục tiêu:** thay hoàn toàn file VBA `Humidity_Inspection_System_FINAL_v4.xlsm` (kiểm ẩm hàng thành phẩm kho EHV) bằng web app **Next.js 15 + TypeScript + Tailwind + Supabase + Vercel**.
- **Gói mã nguồn hiện hành:** `humidity-inspection-web.zip` (đã gửi chị ngày 21/10/2026). Thư mục gốc trong zip: `humidity-inspection-web/`.
- **CẢNH BÁO môi trường Claude:** máy làm việc (`/home/claude`) bị xóa khi sang chat mới. Bản 1 từng bị mất vì chưa đóng gói. ⇒ **Mọi thay đổi phải đóng gói zip + present_files trong cùng lượt.** Ở chat mới, yêu cầu chị tải lại `humidity-inspection-web.zip` (và `.xlsm` nếu cần dữ liệu thật).

---

## 1. Current project status
| Hạng mục | Trạng thái |
|---|---|
| Phân tích VBA, business rules | ✅ Xong (không làm lại) |
| Schema Supabase + seed dữ liệu từ v4 | ✅ Xong, đã chạy thử trên PostgreSQL 16 |
| Source code toàn bộ màn hình | ✅ Xong, `tsc` 0 lỗi, `next build` OK (19 trang tĩnh/động, 1 middleware) |
| Engine so với dữ liệu thật | ✅ 739/739 lô khớp, 51/51 lô kế hoạch, 202 thùng mẫu |
| Mobile Inspection (QR) | ✅ Xong – 2 chế độ: **form công nhân** (mặc định) + **Chế độ QA** (`?full=1`) |
| Auto email Daily Plan | ✅ Xong (SMTP / Resend). v1.4: chọn **giờ cố định 08:00** hoặc **ngay sau khi nạp báo cáo kho**, chọn ngày gửi, cron 09:00 gửi bù, email **Báo trước** khi có lô mới |
| Kiểm lại sau tái chế (rework) | ✅ Xong – đo **toàn bộ thùng mẫu** (chị xác nhận 21/10/2026) |
| Deploy thật lên Supabase/Vercel | ✅ **03/11/2026 chạy được**: https://humidity-qa.vercel.app (Tổng quan hiển thị số liệu seed). Còn: email (chờ IT), macro Outlook, nạp báo cáo kho mới |
| Thử trên điện thoại thật / email thật / Power Automate | ⏳ Chưa |

---

## 2. Completed features
**Màn hình máy tính** (`src/app/(app)/`): Tổng quan `/`, Kế hoạch `/plan` (tab đã hủy, nút lập lại), Nhập kết quả `/inspect`, Lịch sử `/history` (phân trang 100, tạo CAPA, nút Kiểm lại), Tồn kho theo lô `/stock`, Cập nhật báo cáo kho `/import` (upload + lịch sử nạp + nạp HUMIDITY_REPORT cũ), In biểu mẫu & QR `/form-print` (biểu mẫu giấy có cột QR + tem QR dán thùng), Báo cáo kỳ `/report`, Dashboard `/dashboard`, CAPA `/capa`, `/capa/[id]`, Cài đặt `/settings` (tham số, email, store, brand map, người dùng + đặt lại mật khẩu).

**Điện thoại** (`src/app/m/`):
- `/m` danh sách lô cần đo hôm nay: lọc **theo khu kho** (key của `location_pallets`), tìm JO/PO, lô trễ viền đỏ, lô đang đo dở xếp trước, lượt kiểm lại chữ đỏ.
- `/m/scan` quét QR (html5-qrcode, cần https) hoặc gõ PlanID.
- `/m/lot/[planId]` → **WorkerEntry** (form công nhân): 3 bước/thùng (Vị trí-pallet bằng nút to → Số thùng + SL áo → Đo 3 áo), **bàn phím số trên màn hình** có dấu phẩy, tự sang áo khi gõ xong 1 số thập phân, ô số đo dạng “ống đo ẩm” (thang 0–10%, vạch đỏ 6,5%), ĐẠT/KHÔNG ĐẠT ngay, “Lưu thùng” → thùng tiếp; dãy nút thùng (xanh/đỏ/xám); tên người đo nhớ trong `localStorage hm-worker`; mất sóng → hàng đợi `localStorage hm-wq:<planId>`, tự gửi khi online; màn hình kết thúc lô; nút **Nhập kiểm lại sau tái chế** khi FAIL. Không gửi `reworkHumidity/remark` → không ghi đè dữ liệu QA.
- `?full=1` → **InspectionEntry** mobile (QA): sửa ngày, độ ẩm tái chế, ghi chú; nháp `hm-draft:<planId>`, hàng đợi tự lưu, cảnh báo trùng số thùng/số đo >15%.

**Backend**: import báo cáo kho (signed upload → Storage → parse streaming), webhook Power Automate, lập kế hoạch, lưu số đo + tự đóng lô, CAPA tự tạo khi FAIL, rework, 6 loại xuất Excel, QR SVG, cron, email (xem trước/gửi thử/gửi ngay, 1 lần/ngày, cảnh báo báo cáo kho cũ, bỏ ngày trống, bỏ Chủ nhật), health check, phân quyền 4 vai trò.

**v1.4 (02/11/2026) – theo thiết kế canvas “Humidity Inspection” chị duyệt:**
- `settings.email_trigger` (CRON | AFTER_IMPORT), `settings.email_send_days int[]` (1=T2…6=T7, chỉ T2–T7 – chị chốt 02/11), `settings.email_notify_ahead bool` (mặc định true) – `0002_auto_mail.sql` + gộp vào 0001.
- Giờ gửi cố định **08:00** (cron `0 1 * * 1-6`), gửi bù 09:00 (`0 2 * * 1-6`).
- **Báo trước 1 ngày khi có kế hoạch mới:** email ngày có mục “Báo trước – kế hoạch ngày [ngày gửi kế tiếp]” (T7 → T2, `nextSendDay`), lô `created_at` > lần gửi SENT gần nhất (DAILY/NOTICE) gắn nhãn MỚI. Sau khi đã gửi email ngày, nạp báo cáo kho lại phát sinh lô PENDING mới có sched_date ≤ ngày gửi kế tiếp → `sendNewLotNotice()` gửi email kind **NOTICE** chỉ gồm lô mới (không đính kèm).
- Cài đặt → Email: bật/tắt, chọn thời điểm gửi (thẻ radio), nút ngày gửi; lịch sử gửi có nút **Gửi lại** ở dòng DAILY lỗi gần nhất.
- `sendAfterImport()` gọi sau `runImport` ở `/api/import/process` và `/api/import/webhook` (không ném lỗi, trả `email` trong JSON).
- Cron 08:00 `/api/cron/daily-plan`: chế độ AFTER_IMPORT chỉ gửi nếu hôm nay đã nạp báo cáo. Cron mới 09:00 `/api/cron/email-deadline`: chưa gửi hôm nay → gửi bù.
- `sendDailyEmail` bỏ qua ngày không nằm trong `email_send_days` (trừ force/test).
- Tổng quan: nút **Gửi kế hoạch hôm nay** (admin/planner, có xác nhận), dòng trạng thái email hôm nay; bảng lô cần kiểm + trang Kế hoạch có nút **Nhập kết quả** mỗi dòng.
- `tools/outlook/ThisOutlookSession.txt` (VBA, ASCII, CRLF): NewMailEx + quét lại 2 ngày khi mở Outlook → POST JSON base64 tới `/api/import/webhook` (header x-webhook-secret), MSXML2.XMLHTTP.6.0 (theo proxy Windows); lưu EntryID đã nạp ở `%APPDATA%\HumidityTHV\da_nap.txt`, log `log.txt`; không sửa mail. Chưa chạy thử trên Outlook thật.
- docs/05: GitHub web chỉ nhận 100 file/lần → tải 2 lần (`src` trước, phần còn lại sau); mục 8 viết lại; checklist thêm 3 dòng.

**Đã sửa khi review (v1.1):** ưu tiên “DONE” sai cho lô FAIL chưa đủ mẫu; mất số khi mất sóng; tự lưu bị rơi khi gõ nhanh; validate toàn bộ trước khi ghi; CAPA LEGACY không liên kết (`history_plan_id`); CAPA ghi đè Source LEGACY; email gửi trùng; maxDuration 120→60; open redirect ở login; khóa `readings_per_carton=3`; validate QR id; **nâng Next 15.3.5→15.5.27, React 19.1.0→19.2.8** (lỗ hổng RCE React Server Components 12/2025).

---

## 3. Pending features / quyết định chờ
1. ~~Phạm vi kiểm lại~~ → **đã chốt: đo toàn bộ thùng mẫu** (v1.3).
2. Chị deploy theo `docs/05` + chạy checklist mục 9.
3. Chọn cách gửi email (SMTP O365 cần IT bật Authenticated SMTP / Resend cần DNS / Gmail app password để thử) – **chị chưa chốt**; v1.4 hỗ trợ cả 3.
4. ~~License Power Automate~~ → **đã kiểm 02/11/2026: chị KHÔNG có Premium** (chỉ Power Automate Free + for Office 365, Standard connectors). ⇒ dùng **macro Outlook** `tools/outlook/ThisOutlookSession.txt` (docs/05 §7b). Lâu dài: xin IT app Azure (Graph Mail.Read) để web tự đọc mail không phụ thuộc máy.
5. Thử form công nhân trên điện thoại thật, thu góp ý (cỡ chữ, găng tay, thứ tự bước).
6. Ý tưởng chưa làm (chỉ làm khi chị yêu cầu): PIN đăng nhập nhanh cho công nhân; báo cáo năng suất theo người đo; in tem QR khổ nhãn cụ thể; thông báo Zalo/Teams.

---

## 4. Database schema (`supabase/migrations/0001_schema.sql`, chạy lại an toàn)
Hàm: `hm_today()` (giờ VN), `hm_plan_date()` (override hoặc hôm nay), `handle_new_user()` (trigger: user đầu tiên = admin, sau = viewer), `hm_role()`.

| Bảng | Khóa / cột chính |
|---|---|
| `settings` (id=1) | **email_trigger, email_send_days, email_notify_ahead (v1.4)**, hum_limit 6.5, sample_rate 0.02, readings_per_carton 3, rain_start 5, rain_end 10, iso_weeks_rain 4, iso_weeks_dry 6, preship_earliest 7, preship_deadline 5, plan_lookahead 14, plan_date_override, grade_filter 'A', warehouse_sheet 'FGs_Report', mail_subject, form_warehouse, company_*, email_enabled, email_recipients[], email_cc[], email_days_ahead 3, email_skip_empty, last_email_date, last_imported_file, last_import_time |
| `profiles` | id→auth.users, email, full_name, role (admin/planner/qa/viewer) |
| `stores` | store_name PK, include, rows_in_report, note |
| `brand_map` | brand_name PK, brand_code, note, auto_added |
| `warehouse_imports` | id, file_name, report_date, source (upload/webhook/legacy/replan/seed), carton_rows, included_rows, lot_count, stats jsonb |
| `stock_lots` | id, import_id, brand_code, customer, brand_name, jo, buyer_po, style, colors, locations, pallets, **location_pallets jsonb** {khu:[pallet]}, cartons, qty, bpo_date, stock_in_date, stores — ghi đè mỗi lần nạp |
| `inspection_plan` | plan_id PK (`HI-yymmdd-###`, rework `…-R1`), brand_code, customer, jo, buyer_po, style, color, locations, pallets, location_pallets, cartons, qty, bpo_date, stock_in_date, sched_date, trigger (PRE-SHIPMENT / RE-INSPECT (new BPO) / **REWORK**), sample_cartons, status (OPEN/ARCHIVED/CANCELLED), final_result, inspection_date, qa_name, rework_humidity, remark, cancel_reason, **kind (NORMAL/REWORK)**, **parent_plan_id** |
| index | `plan_open_lot` unique (upper jo, upper buyer_po) where OPEN and kind=NORMAL; `plan_open_rework` unique (parent_plan_id) where OPEN and kind=REWORK |
| `inspection_readings` | id, plan_id FK, sample_no (unique cặp), inspection_date, location, pallet, audit_carton_no, qty_in_carton, r1–r3 (0–100), reading_count & carton_max (generated) — giữ lại sau đóng lô |
| `inspection_history` | plan_id PK (HI-/LEG-), inspection_date, brand_code, jo, color, bpo, stock_in_date, exfty_date, total_cartons, audit_carton_no, qty_in_carton, readings ("4.0/4.5/4.0 \| …"), reading_count, cartons_tested, sample_required, sampling_check OK/UNDER, max_humidity, avg_humidity, result PASS/FAIL/NO DATA, qa, rework_humidity, trigger, source (SYSTEM / SYSTEM - CAPA/REWORK REQUIRED / tên file legacy), archived_on, location_pallet |
| `capa` | id uuid, capa_no `CAPA-yymm-###`, plan_id, **history_plan_id**, brand/jo/po/color, inspection_date, max_humidity, hum_limit, failed_cartons, problem, root_cause, containment, corrective_action, preventive_action, owner, due_date, rework_humidity, verification, status (OPEN/IN_PROGRESS/VERIFICATION/CLOSED/CANCELLED), source AUTO/MANUAL, closed_* |
| `capa_logs`, `email_logs` (kind DAILY/TEST/NOTICE, status SENT/ERROR/SKIPPED_EMPTY), `activity_log` | nhật ký |
| **view `v_plan`** | plan + days_in_wh, aging_weeks, threshold_weeks, cartons_tested (đủ 3 số), cartons_started, max_humidity, fail_cartons, insp_by (BPO−5), plan_date, **lot_result** (ARCHIVED→final_result; fail>0→FAIL; đủ mẫu→PASS; có số→IN PROGRESS; else PENDING), **priority** (DONE chỉ khi đã đóng; LATE nếu plan_date hoặc sched_date > insp_by; else ON TIME). Tạo bằng `drop view … ; create view` (vì `p.*`). |

RLS: mọi bảng chỉ `select` cho `authenticated`; ghi qua API server bằng service role. Bucket Storage `imports` (private).

**Seed** (`supabase/seed.sql`, ~370 KB; hoặc 3 phần trong `supabase/seed-parts/`): settings, 11 store (3 include), 30 brand map, 279 lịch sử, 739 lô tồn (báo cáo `bao-cao_2026-10-19.xlsx`), 51 lô OPEN + 202 thùng mẫu (PlanID `HI-261017-…`). Sinh bằng `scripts/make-seed.ts`.

---

## 5. Business rules (chi tiết: `docs/01-business-rules.md`)
- Báo cáo kho `bao-cao_yyyy-mm-dd.xlsx`, sheet `FGs_Report`, 1 dòng = 1 UCC; tiêu đề tìm theo tên cột trong 5 dòng đầu (bắt buộc `Ref no`, `Ucc`); trùng tên file → bỏ qua (trừ “Nạp lại”).
- Chỉ store Include=Y, Grade A. **Lô = Brand Code + JO + Buyer PO**. BPO date, ngày nhập kho = ngày sớm nhất. Brand mới → code = tiền tố Style no, tự thêm (auto_added). Store mới → Include=N chờ duyệt.
- Ngày kiểm = MAX(PlanDate, BPO−7). ISO tối thiểu theo tháng của ngày kiểm: mùa mưa T5–T10 = 4 tuần, khô = 6 tuần. DUE nếu BPO ≤ 14 ngày tới. Trigger khi DUE và tồn ≥ ISO tại ngày kiểm: chưa kiểm → PRE-SHIPMENT; BPO − lần kiểm gần nhất > 7 → RE-INSPECT (new BPO). Quá BPO → không lập kế hoạch. Trễ hạn nếu PlanDate > BPO−5. Bỏ quy tắc 23/26 tuần.
- Kế hoạch: lô PENDING hết hàng/hết trigger → CANCELLED (giữ lý do); BPO đổi → dời lịch; cập nhật vị trí/pallet lô mở. Lô REWORK không bị đụng.
- Mẫu = ROUNDUP(cartons×2%) (min 1), 3 áo/thùng. Thùng PASS ≤ 6,5%. Lô FAIL nếu ≥1 thùng FAIL; đóng khi PASS/FAIL và đủ mẫu → ghi Lịch sử; FAIL chưa có tái chế → Source `SYSTEM - CAPA/REWORK REQUIRED` + tạo CAPA tự động.
- Ngày kiểm không sau hôm nay, không trước 14 ngày.
- CAPA đóng được khi có root_cause + corrective_action + rework_humidity ≤ 6,5%. Rework ghi ngược Lịch sử (chỉ đổi Source của dòng SYSTEM).
- **Rework (R8):** từ lô FAIL đã đóng (chỉ lô `HI-`, không LEGACY) tạo `<id>-R<n>`, sched = hôm nay, thùng = **toàn bộ thùng mẫu của lô gốc**, mọi lần kiểm lại (điền sẵn vị trí/pallet/số thùng/SL áo). Đóng: PASS → rework_humidity = max ghi vào Lịch sử lô gốc, Source=SYSTEM, CAPA→VERIFICATION; FAIL → CAPA→IN_PROGRESS. Không tạo dòng Lịch sử riêng; ghi chú nối vào trigger lô gốc + capa_logs.
- Legacy import HUMIDITY_REPORT: tiêu đề “Audit carton no” trong 12 dòng đầu, số đo = cột giữa “Actual humidity” và “Result”, mã `LEG-yymmdd-###`, bỏ trùng (ngày+JO+BPO).
- Email: lô cần kiểm hôm nay (LATE đầu) + N ngày tới, CAPA mở, cảnh báo báo cáo kho cũ (>1 ngày, thứ Hai cho 2), đính kèm Form Excel, 1 lần/ngày (`last_email_date`).

---

## 6. Folder structure
```
humidity-inspection-web/
├─ PROJECT_MEMORY.md            ← file này
├─ README.md · package.json (next 15.5.27, react 19.2.8) · package-lock.json
├─ next.config.ts · tailwind.config.ts (màu VBA: teal #1693B5, teal-dark #0E6F8A, pass #2E9E5B, fail #D64545, input #FFFBE6)
├─ vercel.json (region sin1, cron "0 1 * * 1-6" daily-plan + "0 2 * * 1-6" email-deadline) · .env.example · tsconfig.json
├─ supabase/ migrations/0001_schema.sql · 0002_auto_mail.sql · 0003_email_text.sql · seed.sql · seed-parts/seed-{1,2,3}-*.sql
├─ tools/outlook/ThisOutlookSession.txt (macro Outlook tự nạp báo cáo kho)
├─ scripts/ test-engine.ts · make-seed.ts · test-email.ts
├─ docs/ 01-business-rules · 02-kien-truc · 03-doi-chieu-man-hinh · 04-migration · 05-trien-khai · 06-review-va-kiem-thu · 07-huong-dan-qa-dien-thoai · email-preview-mau.html
├─ public/ icon.svg · manifest.webmanifest (PWA, start_url /m)
└─ src/
   ├─ middleware.ts                 (refresh session, chặn trang khi chưa login, giữ ?next=)
   ├─ app/layout.tsx · globals.css · login/ · error.tsx · not-found.tsx
   ├─ app/(app)/ page · plan · inspect · history · stock · import · form-print · report · dashboard · capa · capa/[id] · settings
   ├─ app/m/ layout · page · scan · lot/[planId]
   ├─ app/api/ import/{sign,process,webhook} · plan/regenerate · inspect/save · rework · legacy-import · export/[kind] · qr/[planId]
   │           cron/{daily-plan,email-deadline} · email/{test,preview} · settings · stores · brand-map · users · capa · capa/[id] · health
   ├─ components/ WorkerEntry · InspectionEntry · ReworkButton · QrScanner · FileImport · CapaForm · SettingsEditors · Sidebar · ui · ActionButton · Bars · LotPicker · PrintButton
   └─ lib/ types · dates · format · auth · api · settings · queries · lotOptions
          supabase/{admin,server,browser} · excel/export · email/{template,dailyPlan}
          engine/ parseWarehouse · rules (thuần) · process (plan/archive/CAPA/import) · inspect · rework · legacy
```
Biến môi trường: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `IMPORT_WEBHOOK_SECRET`, `EMAIL_PROVIDER` (smtp|resend), `SMTP_HOST/PORT/SECURE/USER/PASS` hoặc `RESEND_API_KEY`, `MAIL_FROM`.

---

## 7. Deployment status
- **03/11/2026:** đã deploy được, `/api/health` OK (chỉ EMAIL false), admin `thuytt@esquel.com` (profiles.role admin), đăng nhập OK. Biến NEXT_PUBLIC_* phải là loại **Config** (Secret làm build nhận sai giá trị).
- **02/11/2026:** Supabase project `kiem-am-thv` tạo nhầm eu-west-1 → chị xoá, tạo lại ở **Singapore**: ref `hvefyrzfzfabupnfaqqr` (ap-southeast-1, org ThanhThuy-QA, Free, dùng khoá mới sb_publishable_ / sb_secret_). `vercel.json` giữ `sin1`. GitHub repo `ThanhThuy-Bella/Humidity-QA` (upload web; có thừa `middleware.ts` + `tsconfig.tsbuildinfo` ở gốc – vô hại). Vercel project `humidity-qa` → `https://humidity-qa.vercel.app`. Email: dùng mail công ty O365, chờ IT bật SMTP AUTH.
- **Chưa deploy.** Claude không có quyền/kết nối Supabase, Vercel; chỉ build và chạy `next start` cục bộ với env giả.
- Đã kiểm: `next build` OK; route `/login` 200; `/m/lot/...` chưa login → 307 `/login?next=…`; `/api/qr/<id>` SVG; cron/webhook/API sai quyền → 401; `/api/health` trả rõ thiếu gì.
- Các bước: `docs/05-trien-khai.md` (Supabase Singapore → chạy schema → seed → tạo admin Auto Confirm → tắt sign-up → GitHub upload → Vercel import + env → `/api/health` ok → Site URL → email → Power Automate).
- Vercel Hobby: maxDuration 60 s, cron có thể lệch ≤1 giờ.

---

## 8. Current bugs / rủi ro đã biết
| # | Mô tả | Mức | Ghi chú |
|---|---|---|---|
| B1 | Chưa kiểm với Supabase thật (Auth, Storage signed upload, PostgREST) | Cao | Kiểm theo checklist docs/05 §9 |
| B2 | Form công nhân/QR chưa thử trên iPhone/Android thật | TB | |
| B3 | Lượt REWORK mở mãi nếu lô đã xuất kho trước khi đo lại | Thấp | Có thể thêm nút hủy lượt kiểm lại |
| B4 | Chạy lại seed tạo thêm 1 dòng `warehouse_imports` source=seed | Thấp | vô hại |
| B5 | Không có khóa chống 2 lần nạp báo cáo kho chạy đồng thời (webhook + upload) | Thấp | |
| B6 | `/api/health` công khai (lộ số dòng lịch sử/store) | Thấp | |
| B9 | Vercel lần deploy đầu: 500 MIDDLEWARE_INVOCATION_FAILED (Edge) dù đủ env; local chạy được. Sửa v1.4.1: `src/middleware.ts` chạy `runtime: "nodejs"`, matcher bỏ `/api/`, try/catch fail-open (layout vẫn requireUser) | Cao | Chờ chị cập nhật file trên GitHub và xác nhận |
| B10 | Trang có `ActionButton` (Tổng quan, Kế hoạch, Nạp báo cáo, Lịch sử, Cài đặt) lỗi 500 "Functions cannot be passed directly to Client Components" do truyền prop `render` (hàm) từ Server Component. Sửa v1.4.1: prop `result` = 'plan'|'capa'|'email'|'resend', định dạng trong ActionButton. **Không bao giờ truyền hàm từ page server sang component client.** Trang login hiện lỗi thật thay vì luôn 'Sai email hoặc mật khẩu' | Cao | Đã sửa, đã deploy 03/11 – OK |
| B8 | Môi trường Claude không chụp được màn hình (không tải được Chromium) | – | Dùng Visualizer để xem trước UI |

---

## 9. Next recommended actions
1. Deploy theo docs/05, chạy checklist; báo lại lỗi (kèm ảnh chụp / nội dung `/api/health`).
2. Cho 1–2 công nhân đo thử 1 lô thật bằng form công nhân → góp ý.
3. Chọn nhà gửi email, Cài đặt → bật gửi tự động, chọn thời điểm + ngày gửi.
4. Chạy song song 3–5 ngày (docs/04) rồi ngừng file Excel.

---

## 10. Hướng dẫn cho Claude tiếp theo (handover kỹ thuật)
- **Bắt đầu chat mới:** nhờ chị tải `humidity-inspection-web.zip` → `cd /home/claude && unzip …/humidity-inspection-web.zip && mv humidity-inspection-web hm && cd hm && npm install`.
- **Kiểm tra sau khi sửa:** `npx tsc --noEmit` → `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_APP_URL=https://kiem-am-thv.vercel.app npx next build`.
- **Kiểm SQL:** `apt-get install -y postgresql` → tạo stub `auth.users`, `auth.uid()`, `storage.buckets`, role `authenticated` → chạy schema + seed bằng `su postgres -c "psql -v ON_ERROR_STOP=1 -d hm -f …"` (copy file vào /tmp, chmod 644).
- **Fixture từ .xlsm (khi chị tải lại file Excel):** dùng openpyxl `data_only=True`; sheet `Warehouse_Report` → ghi ra `bao-cao_2026-10-19.xlsx` sheet `FGs_Report`; `Settings` A38:C48 = stores, A52:C81 = brand map; `Inspection_History` (25 cột), `Stock_Lots` (23), `Humidity_Plan` (24: 0 brand,1 JO,2 PO,3 cartons,4 qty,5 BPO,6 in,7 sched,9 PlanID,…,15 trigger,18 sample), `Humidity_Result` (20: 0 PlanID,1 date,6 sampleNo,7 audit,8 qty,9–11 r1–r3,15 QA,16 rework,17 remark,18 loc,19 pallet) → `fx.json`; named ranges → `names.json`. Rồi `npx tsx scripts/test-engine.ts <bao-cao> fx.json 2026-10-19` (phải “Tất cả kiểm tra PASS”) và `scripts/make-seed.ts … > supabase/seed.sql`.
- **Nguyên tắc code:** engine thuần ở `rules.ts`; mọi ghi qua API + `requireRole`; ngày là chuỗi `yyyy-mm-dd` giờ VN; số đo nhận “4,5”; giữ màu/từ ngữ tiếng Việt như hiện có; không dùng localStorage cho dữ liệu chính (chỉ nháp/hàng đợi).
- **Sau mỗi thay đổi:** cập nhật file này (mục 1, 2, 3, 8, 9 và ngày cập nhật), đóng gói zip (loại `node_modules`, `.next`), `present_files`.

## Nhật ký phiên bản
- **v1.7.1 (05/11/2026)** – file đính kèm email đổi tên `HUMIDITY_CHECKING_PLAN_dd-mm-yyyy.xlsx` (biểu mẫu lô cần kiểm hôm nay). Nội dung chị chốt: tiêu đề `HUMIDITY CHECKING PLAN - {ngay}`; lời mở đầu gửi A.Hòa (hạ thùng trước 9h) + C.Tươi (dán lại thùng sau kiểm) – đặt bằng SQL update settings hoặc Cài đặt → Email.
- **v1.7 (05/11/2026)** – theo yêu cầu chị: (1) form công nhân **bỏ bước Vị trí/Pallet** – còn 2 bước Số thùng+SL áo → Đo 3 áo; (2) web máy tính **bỏ menu "Nhập kết quả" và "CAPA"**, bỏ nút Nhập kết quả/link JO ở Tổng quan & Kế hoạch, bỏ cột CAPA ở Lịch sử (thay bằng cột Trạng thái: Chờ tái chế / Đang kiểm lại / Đạt sau tái chế), bỏ CAPA khỏi email & Dashboard; **không tự tạo CAPA** nữa (`CAPA_ENABLED=false` trong process.ts, trang /capa vẫn còn nhưng ẩn); (3) **Kiểm lại khi FAIL**: app /m có mục "Lô KHÔNG ĐẠT – chờ tái chế & kiểm lại" (FAIL 90 ngày, chưa có rework_humidity, chưa có lượt REWORK mở) với nút "Bắt đầu kiểm lại"; Lịch sử nút Kiểm lại mở form điện thoại.
- **v1.6 (05/11/2026)** – Cài đặt → Email: chị tự viết **tiêu đề** (biến {ngay} {so_lo} {so_tre} {ngay_mai} {so_lo_mai} {so_capa}), **lời mở đầu**, **chữ ký**. Cột mới `settings.email_subject_tpl / email_intro / email_signature` – `0003_email_text.sql` (đã gộp vào 0001); `src/lib/email/defaults.ts`; nếu DB chưa có cột thì dùng mặc định. "(0 trễ hạn)" tự bỏ khỏi tiêu đề.
- **v1.5.1 (05/11/2026)** – sửa lỗi nạp báo cáo kho thật `bao-cao_2026-11-05.xlsx` ("Cannot read properties of undefined (reading 'length')"): file WMS có ô **không có toạ độ r="A1"** + sharedStrings nằm sau sheet → exceljs (streaming lẫn full) đều lỗi. `parseWarehouse.ts` thêm **bộ đọc XML riêng (JSZip + regex) làm chính**, exceljs làm dự phòng. Thử file thật: 49.359 UCC, 46.456 thùng sau lọc 3 store, 710 lô, 2,5 giây.
- **v1.5 (04/11/2026)** – giao diện điện thoại nhiều màu: header teal-dark + nút Quét QR vàng, thẻ tổng quan (trễ/đang đo/chưa đo), thẻ lô có màu brand (`src/lib/mobileUi.ts`), pill trạng thái màu, nút "Nhập"; WorkerEntry header teal + nút quay lại danh sách. Thẻ lô + header form hiện **Màu (plan.color)**. QR chung vào app: `/m` (file QR_App_Kiem_Am_A4.pdf) – chị KHÔNG dùng tem QR dán thùng.
- **v1.4 (02/11/2026)** – email tự động: chọn thời điểm (08:00 / sau khi nạp báo cáo kho) + ngày gửi T2–T7 + báo trước 1 ngày khi có kế hoạch mới, cron 09:00 gửi bù, nút gửi ở Tổng quan, nút Nhập kết quả ở bảng lô; docs/05 tải GitHub 2 lần. `tsc` 0 lỗi, `next build` OK, schema+seed chạy 2 lần trên PG16 OK.
- **v1.0 (20/10/2026)** – dựng toàn bộ app, schema, seed, docs, build OK.
- **v1.1 (20/10/2026)** – review 15 lỗi, hoàn thiện Mobile Inspection + Email, nâng Next/React vá bảo mật.
- **v1.3 (21/10/2026)** – kiểm lại sau tái chế đo toàn bộ thùng mẫu của lô gốc (`rework.ts`), sửa chữ trên form công nhân + docs 01/07.
- **v1.2 (21/10/2026)** – form công nhân từng bước (WorkerEntry), danh sách `/m` lọc theo khu, kiểm lại sau tái chế (kind REWORK, `/api/rework`, ReworkButton), API lưu số đo chỉ ghi trường lô được gửi.
