-- 앱 피드: 게시된 버전의 추출 결과를 JSON 한 덩어리로 내려준다.
-- 정규화 테이블(supply_tracks·eligibility_rules·pricing)은 검수·통계용으로 그대로 두고,
-- 앱이 읽는 형태(ExtractionOutput)는 버전 행에 jsonb로도 저장한다. 수집기 insertVersion이 채운다.
alter table announcement_versions add column if not exists extraction jsonb;

-- 접수 마감 후 7일까지만 내려준다 (마감 표시용). 게시 버전이 없으면 status = UNVERIFIED ("분석 중").
create or replace view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng, a.transit, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
