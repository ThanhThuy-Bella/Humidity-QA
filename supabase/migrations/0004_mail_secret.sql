-- v1.8 (05/11/2026) – hộp thư gửi email lưu trong database (thay cho biến SMTP_* trên Vercel)
-- Chỉ server (service role) đọc được: bật RLS, KHÔNG tạo policy nào. Chạy lại an toàn.
create table if not exists public.mail_secret (
  id          int primary key default 1 check (id = 1),
  smtp_host   text not null default 'smtp.office365.com',
  smtp_port   int  not null default 587,
  smtp_secure boolean not null default false,
  smtp_user   text not null default '',
  smtp_pass   text not null default '',
  mail_from   text not null default '',
  updated_at  timestamptz not null default now()
);
alter table public.mail_secret enable row level security;
revoke all on public.mail_secret from anon, authenticated;
