-- 주변 전월세 시세. 수집할 때 법정동·면적 기준으로 한 번 계산해 넣는다.
-- 사용자 수와 무관한 값이라 공고에 붙여 둔다 (화면에서 부르면 호출이 사용자 수에 비례한다).
alter table announcements add column if not exists market jsonb;

comment on column announcements.market is '같은 법정동 최근 전월세 실거래 요약 (국토교통부 실거래가). 표본이 적으면 null';

-- 앱 피드에 내려 준다
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng, a.transit, a.nearby, a.market, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
