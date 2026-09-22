-- 앱 피드 뷰를 0006의 세 상태로 되돌린다.
--
-- 0008~0012가 각자 컬럼을 더하면서 뷰를 통째로 다시 만들었는데, 그때 복사해 온 본문이
-- 0006 이전 것이었다. 그래서 다섯 번 연달아 같은 회귀가 들어갔다:
--
--   1. 조인 조건이 v.status = 'VERIFIED'로 좁혀져서, 자동 게시(AUTO)된 공고가 뷰에서 떨어졌다.
--      앱은 그걸 "아직 조건을 못 읽음"으로 읽어 전부 "조건 분석 중"으로 보여 준다.
--      실제로 2026-09-22 기준 서버 공고 14건이 모두 UNVERIFIED로 내려가고 있었다.
--   2. checks 컬럼이 빠져서, 자동 검증에서 걸린 지적("가격 정보 없음" 등)이 앱에 오지 않는다.
--      숨기지 않고 그대로 알린다는 것이 이 서비스의 약속인데 그게 끊겨 있었다.
--
-- 0006의 판정을 그대로 살리고, 0008~0012가 더한 컬럼은 유지한다.
-- 뷰를 다시 만들 때는 이 파일을 복사해 쓴다 — 0006이 아니라 여기가 최신이다.
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.detail_url, a.images,
  a.lat, a.lng,
  a.transit, a.nearby, a.market, a.waiting, a.commute, a.units, a.updated_at,
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
