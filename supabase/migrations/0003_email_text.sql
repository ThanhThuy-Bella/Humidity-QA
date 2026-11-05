-- v1.6 (05/11/2026) – tiêu đề, lời mở đầu, chữ ký email kế hoạch do người dùng tự viết (Cài đặt → Email)
-- Chạy 1 lần trong Supabase SQL Editor nếu database đã tạo bằng bản cũ. Chạy lại nhiều lần vẫn an toàn.
alter table public.settings add column if not exists email_subject_tpl text not null default '[Kiểm ẩm] Kế hoạch {ngay} – {so_lo} lô cần kiểm ({so_tre} trễ hạn)';
alter table public.settings add column if not exists email_intro text not null default 'Chào các anh chị,
Hệ thống gửi kế hoạch kiểm ẩm hôm nay. Kho vui lòng hạ thùng mẫu theo quy trình, QA đo 3 áo/thùng và nhập kết quả trên app điện thoại.';
alter table public.settings add column if not exists email_signature text not null default 'Trân trọng,
PPC – Tessellation Hòa Bình';
