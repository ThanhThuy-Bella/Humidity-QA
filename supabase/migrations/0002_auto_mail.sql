-- v1.4 (02/11/2026) – Gửi email kế hoạch tự động: chọn cách gửi + ngày gửi
-- CHỈ cần chạy file này nếu database đã chạy 0001_schema.sql bản cũ (v1.3 trở về trước).
-- Cài mới thì 0001_schema.sql đã gồm phần này. Chạy lại nhiều lần vẫn an toàn.

-- CRON         = gửi lúc 08:00 (giờ cron trong vercel.json)
-- email_notify_ahead = gửi email "Báo trước" khi nạp báo cáo kho sau giờ gửi phát sinh lô mới đến ngày gửi kế tiếp
-- AFTER_IMPORT = gửi ngay sau khi nạp xong Daily Stock Report (upload hoặc Power Automate)
-- Cả 2 cách: 09:00 nếu hôm nay chưa gửi được → gửi bù (kèm cảnh báo báo cáo kho chưa cập nhật)
alter table public.settings add column if not exists email_trigger text not null default 'CRON';
alter table public.settings add column if not exists email_send_days int[] not null default '{1,2,3,4,5,6}';
alter table public.settings add column if not exists email_notify_ahead boolean not null default true;
do $$ begin
  alter table public.settings add constraint settings_email_trigger_chk check (email_trigger in ('CRON','AFTER_IMPORT'));
exception when duplicate_object then null; end $$;
