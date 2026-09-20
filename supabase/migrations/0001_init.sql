-- 공공주택 비서 V0.1 스키마
-- 공고 데이터: 공개 읽기. 사용자·결제·푸시 토큰: RLS 또는 service role 전용.
create extension if not exists "pgcrypto";

create type housing_type as enum ('happy','national_rental','newlywed_hope','purchased_rental','public_sale','long_term_rental','other');
create type version_status as enum ('UNVERIFIED','VERIFIED','CONFLICT');
create type pricing_kind as enum ('rental','sale');
create type group_mode as enum ('all_of','any_of');
create type subscription_status as enum ('trial','active','grace','expired','refunded');

-- ── 공고 ───────────────────────────────────────────────────────────────
create table announcements (
  id uuid primary key default gen_random_uuid(),
  lh_id text not null unique,
  title text not null,
  housing_type housing_type not null,
  region_code text not null,
  published_version int,              -- 앱이 읽는 VERIFIED 버전. null이면 "분석 중"
  latest_version int,                 -- 수집기가 마지막으로 만든 버전
  source_modified_at text,            -- 수정 탐지 키 (LH 수정일시 또는 공고일|마감일)
  notice_date date,
  apply_start date,
  apply_end date,
  pdf_url text,
  lat double precision,
  lng double precision,
  transit jsonb,
  updated_at timestamptz not null default now()
);
create index announcements_region_type_idx on announcements (region_code, housing_type);
create index announcements_apply_end_idx on announcements (apply_end);

create table announcement_versions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  version int not null,
  status version_status not null default 'UNVERIFIED',
  source_modified_at text,
  extracted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by text,
  conflict_reasons jsonb not null default '[]',
  extraction_model text,
  prompt_version text,
  raw_text_chars int,
  unique (announcement_id, version)
);

create table supply_tracks (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references announcement_versions(id) on delete cascade,
  name text not null,
  households int,
  unit_types jsonb not null default '[]'
);
create index supply_tracks_version_idx on supply_tracks (version_id);

create table rule_groups (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references supply_tracks(id) on delete cascade,
  key text not null,                  -- 추출 결과의 group id (예: newlywed)
  mode group_mode not null default 'all_of',
  label text not null,
  unique (track_id, key)
);

create table eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references supply_tracks(id) on delete cascade,
  group_id uuid references rule_groups(id) on delete set null,
  category text not null,
  applies_to jsonb not null default '{}',
  operator text not null,
  value jsonb not null,
  unit text,
  source_page int not null,
  source_text text not null,
  confidence real not null,
  verified boolean not null default false
);
create index eligibility_rules_track_idx on eligibility_rules (track_id);

create table pricing (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references supply_tracks(id) on delete cascade,
  unit_type text not null,
  kind pricing_kind not null,
  deposit bigint,
  monthly_rent bigint,
  sale_price bigint,
  conversion jsonb,
  payment_schedule jsonb,
  maintenance_estimate bigint,
  source_page int not null,
  source_text text not null
);
create index pricing_track_idx on pricing (track_id);

create table loan_products (
  id text primary key,
  name text not null,
  provider text not null,
  kind text not null default 'rental_deposit',
  rule_groups jsonb not null default '[]',
  eligibility jsonb not null default '[]',
  max_amount bigint not null,
  ltv real not null,
  dsr_limit real,
  term_months int not null,
  interest_only boolean not null default true,
  rate_table jsonb not null,
  as_of_date date not null,
  source_url text
);

-- ── 사용자·결제·푸시 ───────────────────────────────────────────────────
create table push_subscriptions (
  expo_token text primary key,
  regions text[] not null default '{}',
  housing_types housing_type[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store text not null check (store in ('google','apple')),
  product_id text not null,
  status subscription_status not null,
  expires_at timestamptz,
  original_transaction_id text,
  updated_at timestamptz not null default now()
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  store text not null,
  payload jsonb not null,
  verified_at timestamptz not null default now()
);

create table issue_reports (                       -- "이 숫자 이상해요" 신고 → 검수 큐
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid references announcements(id) on delete cascade,
  rule_id uuid references eligibility_rules(id) on delete set null,
  pricing_id uuid references pricing(id) on delete set null,
  message text,
  created_at timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table announcements enable row level security;
alter table announcement_versions enable row level security;
alter table supply_tracks enable row level security;
alter table rule_groups enable row level security;
alter table eligibility_rules enable row level security;
alter table pricing enable row level security;
alter table loan_products enable row level security;
alter table push_subscriptions enable row level security;
alter table subscriptions enable row level security;
alter table receipts enable row level security;
alter table issue_reports enable row level security;

-- 공고 데이터: 누구나 읽기. 쓰기는 service role만 (정책 없음 = 차단).
create policy "public read" on announcements for select using (true);
create policy "public read" on announcement_versions for select using (true);
create policy "public read" on supply_tracks for select using (true);
create policy "public read" on rule_groups for select using (true);
create policy "public read" on eligibility_rules for select using (true);
create policy "public read" on pricing for select using (true);
create policy "public read" on loan_products for select using (true);

-- 푸시 토큰: 익명도 자기 토큰 등록·갱신은 가능, 읽기는 service role만.
create policy "anon insert own token" on push_subscriptions for insert with check (true);
create policy "anon update own token" on push_subscriptions for update using (true) with check (true);

-- 구독: 본인만 읽기. 쓰기는 Edge Function(service role).
create policy "own subscription" on subscriptions for select using (auth.uid() = user_id);

-- 신고: 누구나 넣기만.
create policy "anyone can report" on issue_reports for insert with check (true);

-- receipts: 정책 없음 → service role 전용.

-- ── Storage ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('announcement-pdfs', 'announcement-pdfs', true)
  on conflict (id) do nothing;
