-- =====================================================================
-- HUMIDITY INSPECTION SYSTEM – THV / EHV FG WAREHOUSE
-- Supabase schema (thay thế các bảng Excel: tblWarehouse, tblLots, tblPlan,
-- tblResult, tblHistory, tblStores, tblBrandMap, sheet Settings)
-- Chạy file này 1 lần trong Supabase > SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- 0. Hàm tiện ích ngày (giờ Việt Nam)
create or replace function public.hm_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

-- 1. SETTINGS (sheet Settings – named ranges) → 1 dòng duy nhất id = 1
create table if not exists public.settings (
  id                  int primary key default 1 check (id = 1),
  hum_limit           numeric(5,2) not null default 6.5,   -- HumLimit: PASS nếu ≤
  sample_rate         numeric(6,4) not null default 0.02,  -- SampleRate
  readings_per_carton int  not null default 3,             -- ReadingsPerCarton
  rain_start          int  not null default 5,             -- RainStart (tháng)
  rain_end            int  not null default 10,            -- RainEnd   (tháng)
  iso_weeks_rain      int  not null default 4,             -- IsoWeeksRain
  iso_weeks_dry       int  not null default 6,             -- IsoWeeksDry
  preship_earliest    int  not null default 7,             -- PreShipEarliest (BPO − 7)
  preship_deadline    int  not null default 5,             -- PreShipDeadline (BPO − 5)
  plan_lookahead      int  not null default 14,            -- PlanLookAhead
  plan_date_override  date,                                -- PlanDate (trống = hôm nay)
  grade_filter        text not null default 'A',           -- GradeFilter ('' = mọi grade)
  warehouse_sheet     text not null default 'FGs_Report',  -- WarehouseSheet
  mail_subject        text not null default 'Daily Stock Report THV-WH',
  form_warehouse      text not null default 'EHV – FG Warehouse',
  company_name        text not null default 'Tessellation Hoa Binh Company Limited',
  company_address     text not null default 'Lot 20, 1st Street, Luong Son Industrial Zone, Hoa Son Commune, Luong Son District, Hoa Binh Province, Vietnam',
  company_tel         text not null default 'Tel (84) 0218. 3825.828   Fax (84) 0218.3823.776',
  email_enabled       boolean not null default false,
  email_recipients    text[] not null default '{}',
  email_cc            text[] not null default '{}',
  email_days_ahead    int not null default 3,              -- email gồm cả lô N ngày tới
  email_skip_empty    boolean not null default false,      -- không gửi khi 0 lô
  last_email_date     date,                                -- chống gửi trùng trong ngày
  last_imported_file  text,
  last_import_time    timestamptz,
  updated_at          timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;
alter table public.settings add column if not exists email_skip_empty boolean not null default false;
alter table public.settings add column if not exists last_email_date date;
-- v1.4: cách gửi email tự động + ngày gửi trong tuần (1 = T2 … 6 = T7) + báo trước kế hoạch mới
alter table public.settings add column if not exists email_trigger text not null default 'CRON';
alter table public.settings add column if not exists email_send_days int[] not null default '{1,2,3,4,5,6}';
alter table public.settings add column if not exists email_notify_ahead boolean not null default true;
-- v1.6: tiêu đề + lời mở đầu + chữ ký email do người dùng tự viết
alter table public.settings add column if not exists email_subject_tpl text not null default '[Kiểm ẩm] Kế hoạch {ngay} – {so_lo} lô cần kiểm ({so_tre} trễ hạn)';
alter table public.settings add column if not exists email_intro text not null default 'Chào các anh chị,
Hệ thống gửi kế hoạch kiểm ẩm hôm nay. Kho vui lòng hạ thùng mẫu theo quy trình, QA đo 3 áo/thùng và nhập kết quả trên app điện thoại.';
alter table public.settings add column if not exists email_signature text not null default 'Trân trọng,
PPC – Tessellation Hòa Bình';
do $$ begin
  alter table public.settings add constraint settings_email_trigger_chk check (email_trigger in ('CRON','AFTER_IMPORT'));
exception when duplicate_object then null; end $$;

create or replace function public.hm_plan_date() returns date
language sql stable as $$
  select coalesce((select plan_date_override from public.settings where id = 1), public.hm_today())
$$;

-- 2. PROFILES (người dùng + vai trò)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'viewer' check (role in ('admin','planner','qa','viewer')),
  created_at timestamptz not null default now()
);

-- user đầu tiên tự thành admin, các user sau mặc định 'viewer'
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'viewer' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.hm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 3. STORES (tblStores) & BRAND MAP (tblBrandMap)
create table if not exists public.stores (
  store_name     text primary key,
  include        boolean not null default false,
  rows_in_report int not null default 0,
  note           text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.brand_map (
  brand_name  text primary key,
  brand_code  text not null,
  note        text,
  auto_added  boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- 4. WAREHOUSE IMPORTS (log mỗi lần nạp báo cáo kho)
create table if not exists public.warehouse_imports (
  id            bigint generated always as identity primary key,
  file_name     text not null,
  report_date   date,
  source        text not null default 'upload' check (source in ('upload','webhook','legacy','replan','seed')),
  carton_rows   int not null default 0,
  included_rows int not null default 0,
  lot_count     int not null default 0,
  stats         jsonb not null default '{}',
  imported_by   uuid references auth.users(id),
  imported_at   timestamptz not null default now()
);

-- 5. STOCK LOTS (tblLots) – snapshot tồn kho theo lô (Brand + JO + Buyer PO)
create table if not exists public.stock_lots (
  id               bigint generated always as identity primary key,
  import_id        bigint references public.warehouse_imports(id) on delete set null,
  brand_code       text not null,
  customer         text,
  brand_name       text,
  jo               text not null,
  buyer_po         text not null default '',
  style            text,
  colors           text,
  locations        text,
  pallets          text,
  location_pallets jsonb not null default '{}',
  cartons          int not null default 0,
  qty              numeric not null default 0,
  bpo_date         date,
  stock_in_date    date,
  stores           text
);
create index if not exists stock_lots_key on public.stock_lots (upper(jo), upper(buyer_po));
create index if not exists stock_lots_brand on public.stock_lots (brand_code);

-- 6. INSPECTION PLAN (tblPlan)
create table if not exists public.inspection_plan (
  plan_id          text primary key,              -- HI-yymmdd-###
  brand_code       text not null,
  customer         text,
  jo               text not null,
  buyer_po         text not null default '',
  style            text,
  color            text,
  locations        text,
  pallets          text,
  location_pallets jsonb not null default '{}',
  cartons          int not null default 0,
  qty              numeric not null default 0,
  bpo_date         date,
  stock_in_date    date,
  sched_date       date not null,
  trigger          text not null,                 -- PRE-SHIPMENT | RE-INSPECT (new BPO)
  sample_cartons   int not null,
  status           text not null default 'OPEN' check (status in ('OPEN','ARCHIVED','CANCELLED')),
  final_result     text,
  inspection_date  date,
  qa_name          text,
  rework_humidity  numeric(5,2),
  remark           text,
  cancel_reason    text,
  kind             text not null default 'NORMAL' check (kind in ('NORMAL','REWORK')), -- REWORK = kiểm lại sau tái chế
  parent_plan_id   text,                          -- lô gốc bị FAIL (chỉ với REWORK)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.inspection_plan add column if not exists kind text not null default 'NORMAL';
alter table public.inspection_plan add column if not exists parent_plan_id text;
drop index if exists public.plan_open_lot;
create unique index plan_open_lot
  on public.inspection_plan (upper(jo), upper(buyer_po)) where status = 'OPEN' and kind = 'NORMAL';
create unique index if not exists plan_open_rework
  on public.inspection_plan (parent_plan_id) where status = 'OPEN' and kind = 'REWORK';
create index if not exists plan_status_date on public.inspection_plan (status, sched_date);

-- 7. INSPECTION READINGS (tblResult) – 1 dòng / thùng mẫu, giữ lại sau khi lô đóng
create table if not exists public.inspection_readings (
  id               bigint generated always as identity primary key,
  plan_id          text not null references public.inspection_plan(plan_id) on delete cascade,
  sample_no        int not null,
  inspection_date  date,
  location         text,
  pallet           text,
  audit_carton_no  text,
  qty_in_carton    text,
  r1               numeric(5,2) check (r1 is null or (r1 >= 0 and r1 <= 100)),
  r2               numeric(5,2) check (r2 is null or (r2 >= 0 and r2 <= 100)),
  r3               numeric(5,2) check (r3 is null or (r3 >= 0 and r3 <= 100)),
  reading_count    int generated always as ((r1 is not null)::int + (r2 is not null)::int + (r3 is not null)::int) stored,
  carton_max       numeric(5,2) generated always as (greatest(r1, r2, r3)) stored,
  updated_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now(),
  unique (plan_id, sample_no)
);

-- 8. INSPECTION HISTORY (tblHistory)
create table if not exists public.inspection_history (
  plan_id          text primary key,
  inspection_date  date not null,
  brand_code       text,
  jo               text not null,
  color            text,
  bpo              text,
  stock_in_date    date,
  exfty_date       date,
  total_cartons    int,
  audit_carton_no  text,
  qty_in_carton    text,
  readings         text,
  reading_count    int,
  cartons_tested   int,
  sample_required  int,
  sampling_check   text,
  max_humidity     numeric(5,2),
  avg_humidity     numeric(6,2),
  result           text not null,                 -- PASS | FAIL | NO DATA
  qa               text,
  rework_humidity  numeric(5,2),
  trigger          text,
  source           text,
  archived_on      date,
  location_pallet  text,
  created_at       timestamptz not null default now()
);
create index if not exists hist_lot on public.inspection_history (upper(jo), upper(bpo));
create index if not exists hist_date on public.inspection_history (inspection_date);
create index if not exists hist_brand on public.inspection_history (brand_code);

-- 9. CAPA
create table if not exists public.capa (
  id                 uuid primary key default gen_random_uuid(),
  capa_no            text unique not null,         -- CAPA-yymm-###
  plan_id            text references public.inspection_plan(plan_id) on delete set null,
  history_plan_id    text,                         -- PlanID trong Lịch sử (cả LEG-…)
  brand_code         text,
  jo                 text,
  buyer_po           text,
  color              text,
  inspection_date    date,
  max_humidity       numeric(5,2),
  hum_limit          numeric(5,2),
  failed_cartons     int,
  problem            text,
  root_cause         text,
  containment        text,
  corrective_action  text,
  preventive_action  text,
  owner              text,
  due_date           date,
  rework_humidity    numeric(5,2),
  verification       text,
  status             text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','VERIFICATION','CLOSED','CANCELLED')),
  source             text not null default 'AUTO' check (source in ('AUTO','MANUAL')),
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  closed_by          uuid references auth.users(id),
  closed_at          timestamptz
);
alter table public.capa add column if not exists history_plan_id text;
create index if not exists capa_status on public.capa (status);
create index if not exists capa_hist on public.capa (history_plan_id);

create table if not exists public.capa_logs (
  id        bigint generated always as identity primary key,
  capa_id   uuid not null references public.capa(id) on delete cascade,
  at        timestamptz not null default now(),
  user_id   uuid references auth.users(id),
  user_name text,
  action    text not null,
  note      text
);

-- 10. EMAIL LOG + ACTIVITY LOG
create table if not exists public.email_logs (
  id         bigint generated always as identity primary key,
  sent_at    timestamptz not null default now(),
  kind       text not null default 'DAILY',        -- DAILY | TEST | NOTICE
  recipients text[],
  subject    text,
  lot_count  int,
  status     text,
  error      text
);
alter table public.email_logs add column if not exists kind text not null default 'DAILY';

create table if not exists public.activity_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid references auth.users(id),
  action  text not null,
  detail  jsonb not null default '{}'
);

-- 11. VIEW v_plan = tblPlan + các cột công thức
drop view if exists public.v_plan;
create view public.v_plan with (security_invoker = true) as
with s as (select * from public.settings where id = 1),
agg as (
  select r.plan_id,
         count(*) filter (where r.reading_count >= (select readings_per_carton from s)) as cartons_tested,
         count(*) filter (where r.reading_count > 0)                                    as cartons_started,
         max(r.carton_max)                                                              as max_humidity,
         count(*) filter (where r.carton_max > (select hum_limit from s))               as fail_cartons
  from public.inspection_readings r
  group by r.plan_id
),
base as (
  select p.*,
         (p.sched_date - p.stock_in_date)                                   as days_in_wh,
         round((p.sched_date - p.stock_in_date) / 7.0, 1)                   as aging_weeks,
         case when extract(month from p.sched_date) between s.rain_start and s.rain_end
              then s.iso_weeks_rain else s.iso_weeks_dry end                as threshold_weeks,
         coalesce(a.cartons_tested, 0)                                      as cartons_tested,
         coalesce(a.cartons_started, 0)                                     as cartons_started,
         a.max_humidity,
         coalesce(a.fail_cartons, 0)                                        as fail_cartons,
         (p.bpo_date - s.preship_deadline)                                  as insp_by,
         public.hm_plan_date()                                              as plan_date
  from public.inspection_plan p
  cross join s
  left join agg a on a.plan_id = p.plan_id
),
res as (
  select b.*,
         case when b.status = 'ARCHIVED' then b.final_result
              when b.fail_cartons > 0 then 'FAIL'
              when b.cartons_tested >= b.sample_cartons then 'PASS'
              when b.cartons_started > 0 then 'IN PROGRESS'
              else 'PENDING' end as lot_result
  from base b
)
select res.*,
       case when res.lot_result in ('PASS','FAIL') and res.status <> 'OPEN' then 'DONE'
            when res.insp_by is null then ''
            when res.plan_date > res.insp_by or res.sched_date > res.insp_by then 'LATE'
            else 'ON TIME' end as priority
from res;

-- 12. RLS: trình duyệt CHỈ ĐỌC. Mọi thao tác ghi đi qua API server (service role).
do $$
declare t text;
begin
  foreach t in array array['settings','profiles','stores','brand_map','warehouse_imports','stock_lots',
                           'inspection_plan','inspection_readings','inspection_history',
                           'capa','capa_logs','email_logs','activity_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['settings','stores','brand_map','warehouse_imports','stock_lots',
                           'inspection_plan','inspection_readings','inspection_history',
                           'capa','capa_logs','email_logs','activity_log']
  loop
    execute format('drop policy if exists "read_auth" on public.%I', t);
    execute format('create policy "read_auth" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists "profile_self_or_admin" on public.profiles;
create policy "profile_self_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.hm_role() = 'admin');

-- 13. Storage bucket cho file nạp – upload qua signed URL do server cấp
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- v1.8: hộp thư gửi email (chỉ server đọc)
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
