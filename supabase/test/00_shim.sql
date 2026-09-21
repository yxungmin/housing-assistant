-- 로컬 Postgres에서 마이그레이션을 검증하기 위한 최소 대역.
-- Supabase 프로젝트에는 이미 있는 것들이라 실제 배포에서는 쓰지 않는다 (supabase/test/ 는 검증 전용).
create extension if not exists "pgcrypto";

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table if not exists storage.buckets (id text primary key, name text, public boolean);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
