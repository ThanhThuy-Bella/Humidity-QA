# 05 – Triển khai từng bước (Supabase + Vercel)

Không cần cài gì trên máy. Chỉ cần trình duyệt, tài khoản GitHub, Supabase, Vercel (đều có gói miễn phí).
Thời gian: khoảng 45–60 phút.

## 1. Tạo Supabase project
1. https://supabase.com → **New project**. Region: **Southeast Asia (Singapore)**. Đặt mật khẩu database (lưu lại).
2. Chờ project tạo xong (~2 phút).

## 2. Tạo database
1. Menu trái **SQL Editor** → **New query**.
2. Mở file `supabase/migrations/0001_schema.sql`, copy toàn bộ, dán vào, bấm **Run**. Thấy “Success” là xong.
   - **Đã chạy 0001 bản cũ (v1.3) trước đó?** Chỉ cần chạy thêm `supabase/migrations/0002_auto_mail.sql` (hoặc chạy lại 0001 – an toàn, không mất dữ liệu).
3. **New query** lần nữa → dán `supabase/seed.sql` → **Run**.
   - Nếu báo lỗi do quá dài: chạy lần lượt 3 file trong `supabase/seed-parts/`.
4. Kiểm tra: dán câu sau → Run → phải ra 11 · 30 · 279 · 739 · 51 · 202.
   ```sql
   select (select count(*) from stores), (select count(*) from brand_map), (select count(*) from inspection_history),
          (select count(*) from stock_lots), (select count(*) from inspection_plan where status='OPEN'), (select count(*) from inspection_readings);
   ```

## 3. Tạo tài khoản admin đầu tiên
1. **Authentication → Users → Add user → Create new user**: email + mật khẩu của chị, tick **Auto Confirm User**.
2. Người đầu tiên tự thành **admin**. Tài khoản QA/planner tạo sau trong trang **Cài đặt** của app.
3. **Authentication → Sign In / Providers → Email**: tắt “Allow new users to sign up” (chỉ admin tạo tài khoản).

## 4. Lấy khóa Supabase
**Project Settings → API Keys** (hoặc Data API):
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (**tuyệt đối không chia sẻ**)

## 5. Đưa code lên GitHub
1. https://github.com/new → tên `kiem-am-thv` → **Private** → Create.
2. GitHub chỉ nhận **tối đa 100 file mỗi lần tải lên**, dự án có ~110 file ⇒ tải **2 lần**:
   - **Lần 1:** trang repo → **uploading an existing file** → kéo thả **thư mục `src`** → **Commit changes**.
   - **Lần 2:** **Add file → Upload files** → mở thư mục `humidity-inspection-web`, chọn **tất cả trừ `src`** (gồm cả file ẩn `.gitignore`, `.env.example`; không kéo `node_modules`, `.next` nếu có) → **Commit changes**.
   - Kiểm tra: ở trang repo phải thấy `package.json`, `vercel.json`, `src/`, `supabase/` nằm **ngay ở gốc** (không lồng trong thư mục `humidity-inspection-web/`). Nếu bị lồng: Vercel → Settings → **Root Directory** = `humidity-inspection-web`.

## 6. Deploy lên Vercel
1. https://vercel.com → **Add New… → Project** → chọn repo `kiem-am-thv` → **Import**.
2. Framework: Next.js (tự nhận). Mở **Environment Variables**, thêm:
   | Tên | Giá trị |
   |---|---|
   | NEXT_PUBLIC_SUPABASE_URL | (bước 4) |
   | NEXT_PUBLIC_SUPABASE_ANON_KEY | (bước 4) |
   | SUPABASE_SERVICE_ROLE_KEY | (bước 4) |
   | NEXT_PUBLIC_APP_URL | `https://kiem-am-thv.vercel.app` (sửa đúng tên miền sau khi deploy) |
   | CRON_SECRET | chuỗi ngẫu nhiên ≥ 32 ký tự |
   | IMPORT_WEBHOOK_SECRET | chuỗi ngẫu nhiên khác |
   | EMAIL_PROVIDER, SMTP_… hoặc RESEND_… , MAIL_FROM | xem mục 8 |
3. **Deploy**. Xong, mở `https://<tên-miền>/api/health` → `"ok": true`. Nếu `false`, mục nào `false` là thiếu mục đó.
4. Nếu tên miền khác với `NEXT_PUBLIC_APP_URL` đã điền: sửa biến → **Deployments → Redeploy** (QR và link trong email dùng biến này).
5. Supabase → **Authentication → URL Configuration → Site URL** = tên miền app.

## 7. Nạp báo cáo kho tự động từ mail (Power Automate) – tuỳ chọn
Cần connector **HTTP (Premium)**. Nếu Esquel không có bản quyền Premium: mỗi sáng vào `/import` tải file lên (1 lần bấm).
1. https://make.powerautomate.com → **Create → Automated cloud flow** → trigger **When a new email arrives (V3)** (Office 365 Outlook).
   - Folder: Inbox · Subject Filter: `Daily Stock Report THV-WH` · Include Attachments: **Yes** · Only with Attachments: **Yes**.
2. **Apply to each** → `Attachments`. Bên trong: **Condition** `Attachments Name` *ends with* `.xlsx`.
3. Nhánh Yes → **HTTP**:
   - Method: `POST` · URI: `https://<tên-miền>/api/import/webhook`
   - Headers: `Content-Type: application/json` và `x-webhook-secret: <IMPORT_WEBHOOK_SECRET>`
   - Body:
     ```json
     { "fileName": "@{items('Apply_to_each')?['name']}",
       "subject": "@{triggerOutputs()?['body/subject']}",
       "contentBase64": "@{items('Apply_to_each')?['contentBytes']}" }
     ```
4. Lưu, gửi thử 1 mail → trang `/import` hiện dòng “Mail tự động”.
- Giới hạn: Vercel nhận tối đa 4,5 MB/lần ⇒ file Excel ≤ ~3,3 MB (base64 làm to thêm 33%). File lớn hơn: dùng nút tải lên.

## 7b. Không có Premium → macro Outlook (khuyên dùng ở THV)
Tài khoản chỉ có Power Automate Free / for Office 365 (không có Premium connectors) thì dùng macro Outlook classic trên máy người nhận mail kho:
1. Outlook → **File → Options → Trust Center → Trust Center Settings → Macro Settings** → chọn **Notifications for all macros** → OK.
2. **Alt+F11** → Project1 → Microsoft Outlook Objects → double-click **ThisOutlookSession** → dán toàn bộ `tools/outlook/ThisOutlookSession.txt`.
3. Sửa 2 dòng đầu phần CAU HINH: `WEBHOOK_URL` = `https://<tên-miền>/api/import/webhook`, `WEBHOOK_SECRET` = giá trị `IMPORT_WEBHOOK_SECRET` trên Vercel. **Ctrl+S**.
4. Tắt hẳn Outlook rồi mở lại → bấm **Enable Macros** khi được hỏi (mỗi lần mở Outlook).
5. Thử: **Alt+F8 → QuetMailChuaNap** → web `/import` có dòng nạp mới (nguồn webhook). Nhật ký: **Alt+F8 → XemNhatKy**.
- Chỉ chạy khi máy bật và Outlook mở. Mail về lúc tắt máy → lần mở Outlook sau tự quét 2 ngày gần nhất và nạp bù.
- Có rule chuyển mail kho vào thư mục con của Inbox → ghi tên thư mục vào hằng `SUBFOLDER`.
- Không muốn bấm Enable Macros mỗi sáng: tạo chứng chỉ bằng `SelfCert.exe` (thư mục cài Office), trong VBA **Tools → Digital Signature** ký project, rồi chọn **Notifications for digitally signed macros, all other macros disabled** và tin cậy chứng chỉ đó.

## 8. Email kế hoạch hằng ngày
Chọn **một** cách:
- **A. SMTP Office 365**: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
  Hộp thư gửi phải được IT bật **Authenticated SMTP**; tài khoản có MFA cần app password.
- **B. Resend**: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` (domain đã xác minh trên resend.com – cần IT thêm bản ghi DNS).
- Thử nhanh không cần IT: một hộp Gmail riêng + app password (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`).

Sau đó trong app: **Cài đặt → Email kế hoạch hằng ngày**:
1. Nhập người nhận (To / CC, cách nhau bằng `;`) → **Lưu** → **Xem trước email** → **Gửi thử cho tôi**.
2. Tick **Bật gửi kế hoạch tự động**, chọn **Thời điểm gửi**:
   - **Giờ cố định – 08:00**: cron lập lại kế hoạch theo ngày mới rồi gửi.
   - **Ngay sau khi nạp Daily Stock Report**: nạp báo cáo kho xong (nút tải lên hoặc Power Automate mục 7) là gửi luôn – kế hoạch luôn theo báo cáo mới nhất.
3. Chọn **Ngày gửi** (T2–T7, mặc định cả 6 ngày).
4. Tick **Gửi trước kế hoạch 1 ngày khi có kế hoạch mới** (mặc định bật) → **Lưu**:
   - Email hằng ngày có mục **“Báo trước – kế hoạch ngày mai”** (Thứ 7 báo cho Thứ 2) để kho chuẩn bị hạ thùng mẫu; lô phát sinh từ lần gửi trước gắn nhãn **MỚI**.
   - Nếu đã gửi email trong ngày mà sau đó nạp báo cáo kho lại và phát sinh lô mới cần kiểm đến ngày mai → hệ thống tự gửi thêm email **“Báo trước: N lô mới”** chỉ gồm các lô đó.

Cách hệ thống chạy mỗi sáng (2 cron trong `vercel.json`, giờ UTC = giờ VN − 7):
| Giờ VN | Cron | Việc làm |
|---|---|---|
| 08:00 | `/api/cron/daily-plan` | Lập lại kế hoạch. Chế độ *giờ cố định* → gửi email. Chế độ *sau khi nạp* → chỉ gửi nếu hôm nay đã nạp báo cáo kho. |
| 09:00 | `/api/cron/email-deadline` | Hôm nay **chưa gửi được** (kho gửi muộn / 08:00 lỗi) → gửi bù theo kế hoạch hiện có, email kèm dòng cảnh báo báo cáo kho chưa cập nhật. |
- Mỗi ngày tự động gửi tối đa 1 lần. Nút **Gửi kế hoạch hôm nay** ở trang Tổng quan gửi thủ công bất cứ lúc nào (gửi lại cũng được).
- Gói Vercel Hobby: cron có thể lệch trong vòng 1 giờ; gói Pro chạy đúng giờ.
- Lịch sử gửi xem ở Cài đặt; dòng lỗi gần nhất có nút **Gửi lại**.

## 9. Kiểm tra sau deploy (checklist)
- [ ] `/api/health` → ok
- [ ] Đăng nhập admin → Tổng quan hiện số liệu
- [ ] `/stock` 739 lô · `/plan` 51 lô · `/history` 279 dòng
- [ ] `/import` tải báo cáo kho mới → bảng “Daily process completed”
- [ ] `/form-print` → In → quét QR bằng điện thoại → mở đúng lô (đăng nhập lần đầu)
- [ ] Nhập 3 số đo 1 thùng trên điện thoại → tự lưu
- [ ] Tạo tài khoản QA trong Cài đặt
- [ ] Gửi thử email → chọn thời điểm gửi + ngày gửi → Lưu
- [ ] Trang Tổng quan: nút **Gửi kế hoạch hôm nay**, dòng trạng thái email hiện “đã gửi hôm nay”
- [ ] Vercel → Settings → **Cron Jobs** thấy 2 job (08:00 và 09:00)
- [ ] (Nếu dùng) gửi thử mail kho → Power Automate → `/import` có dòng “Mail tự động”
