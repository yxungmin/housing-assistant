-- 단지 이름과 지난 회차 결과.
--
-- 왜 필요한가: "조건은 맞는데 붙을까"에 답하려면 같은 단지가 지난번에 몇 순위에서
-- 마감됐는지를 보여 줘야 한다. 그 값은 LH 청약플러스 당첨자 발표의 커트라인 파일에 있다
-- (collector/src/lh/cutline.ts).
--
-- complex를 따로 두는 이유: 결과 쪽은 단지별로 쪼갠 이름("전북혁신 A10블럭")을 쓰는데
-- 우리 공고 제목은 모집공고의 부모 이름이라 단지 꼬리표가 없는 일이 흔하다.
-- LH 상세 API의 dsSbd.LCC_NT_NM이 그 이름을 주므로 그대로 담아 두고 이을 때 쓴다.
--
-- past_results를 별도 테이블로 두지 않는 이유: 공고 하나에 몇 줄뿐이고 공고와 생사를
-- 같이 한다. 조인할 이유가 없다.
alter table announcements add column if not exists complex text;
alter table announcements add column if not exists past_results jsonb;

comment on column announcements.complex is '공급기관이 부르는 단지 이름 (LH dsSbd.LCC_NT_NM). 지난 회차 결과 매칭용';
comment on column announcements.past_results is '같은 단지의 지난 회차 결과 (공급·신청·경쟁률·마감 순위). 개인정보 없음 — 커트라인 파일의 집계만 담는다';

-- 뷰에 새 컬럼을 싣는다. **0013의 본문을 그대로 복사해서 두 줄만 더했다** —
-- 0008~0012가 각자 옛 본문을 복사해 와 같은 회귀를 다섯 번 넣은 적이 있다(0013 주석 참고).
-- 다음에 뷰를 고칠 때도 이 파일을 복사한다. 여기가 최신이다.
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.detail_url, a.images,
  a.lat, a.lng, a.complex, a.past_results,
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
