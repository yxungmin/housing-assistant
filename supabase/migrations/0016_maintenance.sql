-- 관리비 단가 (K-apt 공동주택관리정보시스템).
--
-- 왜 필요한가: 공고문에 관리비는 거의 없다. 예상 주거비가 관리비를 10만 원으로 고정해 왔는데
-- 전용 26㎡와 59㎡가 같을 리 없다. 수집할 때 단지의 실제 신고값(단지를 맞춘 경우) 또는
-- 같은 구 단지들의 단가 중앙값을 전용 1㎡당으로 받아 두고, 앱이 주택형의 전용면적을 곱한다
-- (collector/src/maintenance/kapt.ts, packages/engine/src/maintenance.ts).
alter table announcements add column if not exists maintenance jsonb;

comment on column announcements.maintenance is 'K-apt 관리비 단가 (원/전용㎡/월). basis=complex 이 단지 신고값 / district 같은 구 중앙값. 못 구하면 null';

-- 뷰에 새 컬럼을 싣는다. **0014의 본문을 그대로 복사해서 한 컬럼만 더했다** (0014 주석 참고).
-- 다음에 뷰를 고칠 때도 이 파일을 복사한다. 여기가 최신이다.
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.detail_url, a.images,
  a.lat, a.lng, a.complex, a.past_results,
  a.transit, a.nearby, a.market, a.waiting, a.commute, a.units, a.maintenance, a.updated_at,
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
