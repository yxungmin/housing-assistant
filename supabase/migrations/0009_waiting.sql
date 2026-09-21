-- 예비입주자 대기현황. 조건이 맞고 돈이 되면 마지막 질문이 "그래서 순번이 오나"다.
-- 수집할 때 단지명으로 맞춰 넣는다. 못 맞추면 null이고 화면에서 통째로 감춘다.
alter table announcements add column if not exists waiting jsonb;

comment on column announcements.waiting is '같은 단지 예비입주자 대기현황 (마이홈포털). 단지명을 못 맞추면 null';

drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng,
  a.transit, a.nearby, a.market, a.waiting, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
