-- 주변 생활 인프라. transit과 나란히 두는 별도 컬럼이다 —
-- transit 안에 밀어 넣으면 "교통"이라는 이름이 거짓이 되고, 나중에 교통 API를 붙일 때 섞인다.
--
-- 모양: [{"kind":"school","name":"망원초등학교","distance_m":320}, ...]
-- 종류는 packages/schema의 NearbyKind(daycare·school·mart·convenience·hospital·park)와 같다.
-- 값은 수집 때 Kakao Local에서 종류마다 가장 가까운 한 곳만 받아 둔다 (collector/src/geo/kakao.ts).
alter table announcements add column if not exists nearby jsonb;

comment on column announcements.nearby is '주변 생활 인프라. 종류별 최근접 1곳, 직선거리(m). 경로·소요시간이 아니다';
comment on column announcements.transit is '가장 가까운 지하철역·버스정류장까지의 직선거리와 도보 환산 시간. 실제 통근 경로가 아니다';

drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng, a.transit, a.nearby, a.updated_at,
  a.published_version,
  case
    when v.id is null then 'UNVERIFIED'   -- 아직 게시된 버전이 없다 (추출 전이거나 CONFLICT)
    when v.status = 'VERIFIED' then 'VERIFIED'
    else 'AUTO'                            -- 자동 검증만 거쳤다
  end as status,
  coalesce(v.checks, '[]'::jsonb) as checks,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status <> 'CONFLICT'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
