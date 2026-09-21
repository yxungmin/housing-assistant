-- 시군구 대표 좌표 → 이 단지까지의 대중교통 통근 시간. 키는 "서울 마포구" 형식.
--
-- 사용자마다 부르지 않고 수집할 때 미리 계산한다. 이유가 둘이다:
--  1. 호출이 사용자 수가 아니라 공고 수에 비례한다 (공고 1건당 시군구 수, 서울·경기면 56회)
--  2. 직장 위치가 서버로 나가지 않는다. 앱은 표에서 자기 시군구를 찾아보기만 한다.
alter table announcements add column if not exists commute jsonb;

comment on column announcements.commute is '시군구 대표 좌표에서의 대중교통 소요 (분·환승). 경로를 못 구한 시군구는 키가 없다';

drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng,
  a.transit, a.nearby, a.market, a.waiting, a.commute, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
