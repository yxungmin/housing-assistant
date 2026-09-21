-- 자동 게시. 사람을 게시 경로에서 뺀다.
--
-- 전까지는 publish_version()(사람 승인)을 거쳐야 앱이 공고를 볼 수 있었다.
-- 그러면 사람이 하루 못 보면 새 공고가 앱에 뜨지 않고, 마감이 짧은 공고는 그대로 지나간다.
-- 정정공고는 더 나쁘다 — 승인 전까지 앱은 이전 버전(틀린 값)을 계속 보여 준다.
--
-- 이제 자동 검증을 통과하면 바로 게시하고, 사람 확인은 게시 조건이 아니라 표시(VERIFIED)로만 남긴다.
--  UNVERIFIED + published  → 앱에서 AUTO  "자동으로 옮긴 조건, 사람은 아직 안 봄"
--  VERIFIED   + published  → 앱에서 VERIFIED "사람이 공고문과 대조함"
--  CONFLICT                → 게시하지 않는다. 앱에서는 "조건 분석 중"

-- 게시하되 알리는 지적 (가격 정보 없음, 세대수 합계 불일치 …). CONFLICT 사유와 뜻이 다르므로 컬럼을 나눈다.
alter table announcement_versions add column if not exists checks jsonb not null default '[]'::jsonb;
comment on column announcement_versions.checks is '자동 검증에서 걸렸지만 게시를 막지는 않는 지적. 앱 화면에 그대로 보인다';
comment on column announcement_versions.conflict_reasons is '게시를 막는 사유. 비어 있지 않으면 status = CONFLICT';

/**
 * 자동 게시: 사람 승인 없이 이 버전을 앱에 내보낸다.
 * CONFLICT는 거부한다. 이미 사람이 확인한(VERIFIED) 버전의 상태는 건드리지 않는다.
 */
create or replace function auto_publish_version(p_version_id uuid)
returns void language plpgsql security definer as $$
declare
  v record;
begin
  select id, announcement_id, version, status into v from announcement_versions where id = p_version_id;
  if v.id is null then raise exception 'version not found'; end if;
  if v.status = 'CONFLICT' then raise exception 'CONFLICT 버전은 게시하지 않는다'; end if;

  update announcements set published_version = v.version, updated_at = now()
   where id = v.announcement_id;
end $$;

comment on function auto_publish_version is '자동 검증 통과분을 사람 승인 없이 게시한다. 사람 확인 도장은 publish_version()이 따로 찍는다';

-- 사람 확인: 게시까지 겸하던 것을 "도장 + (아직 게시 전이면) 게시"로 둔다. 하는 일은 같고 의미만 좁아졌다.
comment on function publish_version is '사람이 공고문과 대조했다는 표시. 앱에는 VERIFIED로 보인다. 게시 자체는 auto_publish_version()이 먼저 한다';

-- 앱 피드: 게시된 버전이면 사람 확인 여부와 무관하게 내려 준다.
-- 뷰는 지우고 다시 만든다 — create or replace는 컬럼 추가를 맨 뒤로만 허용해 나중에 발이 묶인다.
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.lat, a.lng, a.transit, a.updated_at,
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
