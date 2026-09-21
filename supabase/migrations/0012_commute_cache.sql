-- 흩어진 집(매입임대·전세임대)의 주택 목록과 통근 시간 캐시.
--
-- 매입임대는 단지가 아니라 개별 주택 수십~수백 채를 한 공고로 모집한다. 공고문 본문에는
-- "총 81호"만 있고 주택별 소재지·면적·임대조건은 별도 엑셀 첨부에 있다 (collector/src/units/list.ts).
-- 그 목록이 이 유형의 핵심이라 공고 행에 같이 둔다.
alter table announcements add column if not exists units jsonb;

comment on column announcements.units is '흩어진 집 목록 (매입임대·전세임대). 단지형 공고에는 없다';

-- 통근 시간 캐시.
--
-- 왜 서버가 필요한가: 이 유형은 집이 수백 채라 미리 계산할 수 없다.
-- 집 주소 176곳 × 시군구 56곳 = 9,856회인데 카카오 대중교통 경로는 하루 1,000회다.
-- 유일한 길은 사람이 고른 집 하나만 그때 부르는 것(1회)이고, 그러려면 REST 키를 쥔 쪽이 불러야 한다.
-- 앱에 키를 넣으면 뽑아 쓸 수 있으므로 Edge Function이 대신 부른다 (functions/transit).
--
-- 무엇을 저장하는가: 출발 시군구 대표 좌표 → 이 집까지 몇 분.
-- 누가 물었는지는 저장하지 않는다. 출발점은 사용자의 정확한 직장이 아니라 시군구 중심이고,
-- 같은 시군구에 사는 모든 사람이 같은 한 줄을 쓴다. 프로필을 서버에 두지 않는다는 원칙 그대로다.
--
-- 캐시가 차면 호출은 0으로 수렴한다. 같은 공고를 보는 사람이 늘어도 비용이 늘지 않는다.
create table if not exists commute_cache (
  announcement_id uuid not null references announcements(id) on delete cascade,
  -- SupplyUnit.id (주소+동+호)
  unit_id text not null,
  -- 출발 좌표를 소수 3자리(약 100m)로 묶은 키. "37.566,126.902"
  from_key text not null,
  minutes int not null,
  transfers int not null default 0,
  fare int,
  fetched_at timestamptz not null default now(),
  primary key (announcement_id, unit_id, from_key)
);

comment on table commute_cache is '흩어진 집까지의 대중교통 소요. 출발점은 시군구 중심이라 사용자를 가리키지 않는다';
comment on column commute_cache.from_key is '출발 좌표를 소수 3자리로 묶은 값. 같은 시군구 사람이 한 줄을 같이 쓴다';

-- 하루 호출량을 세는 데 쓴다 (Edge Function이 한도 앞에서 멈추기 위해)
create index if not exists commute_cache_fetched_at_idx on commute_cache (fetched_at desc);

alter table commute_cache enable row level security;

-- 읽기는 누구나. 공고 데이터와 같은 성격이고 사용자를 가리키는 값이 없다.
drop policy if exists commute_cache_read on commute_cache;
create policy commute_cache_read on commute_cache for select to anon, authenticated using (true);

-- 쓰기는 Edge Function(service_role)만. 앱이 직접 넣으면 아무 값이나 들어온다.


-- 앱이 주택 목록을 읽어야 한다. 뷰는 지우고 다시 만든다 (create or replace는 컬럼 추가에 실패한다).
drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.detail_url, a.images,
  a.lat, a.lng,
  a.transit, a.nearby, a.market, a.waiting, a.commute, a.units, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
