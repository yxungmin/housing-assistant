-- 공급기관 구분. LH 외에 SH(서울주택도시개발공사)를 수집하면서 식별자가 기관마다 겹칠 수 있다.
-- lh_id는 "공급기관 내부 공고 식별자"로 의미를 넓힌다 (LH PAN_ID, SH 게시판 seq).
alter table announcements add column if not exists provider text not null default 'LH';

alter table announcements drop constraint if exists announcements_lh_id_key;
create unique index if not exists announcements_provider_external_idx on announcements (provider, lh_id);
create index if not exists announcements_provider_idx on announcements (provider);

comment on column announcements.provider is '공급기관 코드 (LH, SH)';
comment on column announcements.lh_id is '공급기관 내부 공고 식별자 (LH PAN_ID, SH 게시판 seq)';

-- 앱 피드에도 기관을 내려 준다 (화면에 "LH"/"SH" 배지)
-- create or replace는 컬럼을 중간에 끼우지 못한다 ("cannot change name of view column").
-- provider를 가운데 넣으므로 지우고 다시 만든다. grant도 함께 사라지므로 아래에서 다시 준다.
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng, a.transit, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
