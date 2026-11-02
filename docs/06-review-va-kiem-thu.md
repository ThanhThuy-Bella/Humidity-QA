# 06 – Review deliverables & kết quả kiểm thử (20/10/2026)

## A. Lỗi / rủi ro tìm thấy khi review bản trước và cách sửa
| # | Vấn đề | Mức | Đã sửa |
|---|---|---|---|
| 1 | Mã nguồn chưa từng được đóng gói, mất khi môi trường làm việc reset | Cao | Dựng lại toàn bộ, đóng gói zip |
| 2 | `v_plan`: lô **FAIL nhưng chưa đủ mẫu** bị gắn ưu tiên “Xong” → rơi khỏi đầu danh sách trễ hạn | Cao | “Xong” chỉ khi lô đã đóng |
| 3 | Mất số đo khi mất sóng trong kho / tải lại trang | Cao | Lưu nháp trên máy, tự gửi lại khi có mạng |
| 4 | Gõ nhanh 2 thùng: thùng thứ 2 không được tự lưu khi thùng 1 đang gửi | TB | Hàng đợi tự lưu |
| 5 | Server ghi dở nếu 1 thùng sai; ô chữ (vd “4..5”) bị lưu thành trống không báo | TB | Kiểm tra hết trước khi ghi, báo lỗi rõ ô nào |
| 6 | CAPA tạo tay cho lô LEGACY không gắn được với dòng Lịch sử → tạo trùng | TB | Cột `history_plan_id`, chặn tạo trùng |
| 7 | Cập nhật độ ẩm tái chế ở CAPA ghi đè Nguồn của dòng LEGACY thành “SYSTEM” | TB | Chỉ đổi Nguồn của dòng SYSTEM |
| 8 | Email có thể gửi 2 lần/ngày (cron chạy lại, bấm tay) | TB | Tối đa 1 lần/ngày + nhật ký |
| 9 | Email không báo khi báo cáo kho cũ → kế hoạch thiếu lô mà không ai biết | TB | Dòng cảnh báo vàng trong email |
| 10 | `maxDuration 120` vượt giới hạn gói Vercel Hobby (60 giây) | TB | Đặt 60 giây, region Singapore (sin1) |
| 11 | Đăng nhập: `?next=//trang-ngoài` chuyển hướng ra ngoài | Thấp | Chỉ cho đường dẫn nội bộ |
| 12 | Cho sửa “Số đo/thùng” nhưng form chỉ có 3 ô | Thấp | Khóa = 3 |
| 13 | QR nhận chuỗi bất kỳ | Thấp | Chỉ nhận mã lô hợp lệ |
| 14 | Không có cách kiểm tra cấu hình sau deploy | – | Thêm `/api/health` |
| 15 | Next 15.3.5 + React 19.1.0 nằm trong dải lỗ hổng RCE của React Server Components (công bố 12/2025) | **Cao** | Nâng Next 15.5.27, React 19.2.8 |

## B. Hoàn thiện Mobile Inspection
- Quét QR bằng app Camera mặc định hoặc nút **Quét QR** (rung khi đọc được); chưa đăng nhập → đăng nhập xong mở đúng lô.
- Thẻ từng thùng, ô nhập lớn (không bị iOS phóng to), bàn phím số, dãy nút **1 2 3 …** tô màu theo trạng thái để nhảy nhanh, nút “Thùng N ↓” tới thùng chưa đo.
- Tự lưu khi đủ 3 số; **mất sóng vẫn nhập tiếp**, tự gửi khi có mạng; khôi phục nháp sau khi tải lại trang; cảnh báo khi rời trang còn số chưa lưu.
- Cảnh báo: số thùng trùng, số đo > 15% (nghi gõ nhầm 45 thay vì 4,5), ô không phải số.
- Hết phiên đăng nhập: báo rõ, số đo vẫn giữ trên máy.
- Danh sách `/m`: thanh tiến độ, tìm theo JO/PO, lô các ngày tới bấm được. Thêm vào màn hình chính như ứng dụng (PWA manifest).
- Tem QR dán thùng mẫu: `/form-print` → **Tem QR dán thùng mẫu**.

## C. Hoàn thiện Auto Email Daily Plan
- Nội dung: lô cần kiểm hôm nay (trễ lên đầu, FAIL chưa đủ mẫu tô đỏ), lô xếp lịch N ngày tới, số CAPA đang mở, cảnh báo báo cáo kho cũ, link mở thẳng form trên điện thoại, đính kèm biểu mẫu Excel; có bản text cho máy không hiển thị HTML.
- Gửi qua **SMTP** hoặc **Resend**; tuỳ chọn không gửi ngày không có lô; bỏ qua Chủ nhật; tối đa 1 lần/ngày.
- Trong app: **Xem trước**, **Gửi thử cho tôi**, **Gửi ngay cho danh sách**, nhật ký 8 lần gửi gần nhất (lỗi hiện đỏ).
- Lỗi lập kế hoạch không chặn việc gửi email và ngược lại.

## D. Kết quả kiểm thử
| Kiểm thử | Kết quả |
|---|---|
| Engine vs dữ liệu thật file v4 (`scripts/test-engine.ts`): đọc 54.729 UCC (3,7 giây) → 51.848 sau lọc → 739 lô | **739/739 lô khớp Stock_Lots ở 7 cột** |
| Lô cần kiểm vs Humidity_Plan | **51/51** |
| Thùng mẫu ROUNDUP(×2%) vs Humidity_Plan và Humidity_Result | **202 = 202 = 202** |
| Schema + seed trên PostgreSQL 16 (giả lập auth/storage của Supabase), chạy 2 lần | Thành công, đếm 11/30/279/739/51/202 |
| View `v_plan` với số đo thử: PASS / FAIL chưa đủ mẫu / đang kiểm | Đúng |
| Email dựng từ 51 lô thật (ngày 20/10) | 40 lô cần kiểm, 37 trễ hạn, link đúng; cảnh báo báo cáo cũ hoạt động |
| `tsc --noEmit` | 0 lỗi |
| `next build` (production) | Thành công, 35 route |
| Chạy server production: /login, chuyển hướng QR khi chưa đăng nhập, QR SVG, chặn cron/webhook/API sai quyền, health | Đúng như thiết kế |

## E. Chưa kiểm được trong môi trường của em (chị kiểm theo checklist docs/05 mục 9)
- Gọi Supabase thật (Auth, Storage, PostgREST) – em không có tài khoản/kết nối tới Supabase.
- Deploy thật lên Vercel, cron chạy đúng giờ.
- Gửi email thật (SMTP Office 365 của Esquel có thể bị IT khóa).
- Flow Power Automate (cần license HTTP Premium).
- Camera trên điện thoại thật (iPhone/Android) – thư viện html5-qrcode hỗ trợ cả hai, cần https.

## F. Bảo trì
- Mỗi 1–2 tháng cập nhật bản vá: `npm i next@15 react@19.2 react-dom@19.2` rồi commit (hoặc bật Dependabot trên GitHub để nhận cảnh báo).
