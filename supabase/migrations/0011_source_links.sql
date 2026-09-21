-- 원문으로 가는 길 두 가지.
--
--  detail_url: 기관의 공고 상세 페이지. 지금은 공고문 PDF 주소만 있어서, 그게 없는 공고는
--              앱이 "원문 주소가 아직 없어요"라고만 말하고 끝난다. 상세 페이지는 목록 응답에
--              항상 들어 있으므로(LH DTL_URL, SH view.do) 추출이 실패한 공고에서도 채울 수 있다.
--
--  images:     기관이 공고에 이미지로 붙여 둔 것 (위치도·단지조감도).
--              LH 상세 응답의 dsSbdAhfl에 온다. 우리가 공고문에서 뽑은 그림이 아니라
--              기관이 이미지 파일로 준 것만 넣는다 — 출처가 분명해야 화면에서 그렇게 말할 수 있다.
--              붙어 있는 공고가 더 적고, SH는 게시판에 이런 이미지가 없어 항상 비어 있다.
--              [{kind:"위치도", name:"...jpg", url:"https://apply.lh.or.kr/lhapply/lhImageView2.do?fileid=..."}]
alter table announcements add column if not exists detail_url text;
alter table announcements add column if not exists images jsonb;

comment on column announcements.detail_url is '기관의 공고 상세 페이지. 앱이 외부 브라우저로 연다';
comment on column announcements.images is '기관이 공고에 붙여 둔 이미지 (위치도·단지조감도). 공고문에서 뽑은 그림이 아니다';

drop view if exists app_announcements;
create view app_announcements
with (security_invoker = true) as
select
  a.id, a.lh_id, a.provider, a.title, a.housing_type, a.region_code,
  a.notice_date, a.apply_start, a.apply_end, a.pdf_url, a.detail_url, a.images,
  a.lat, a.lng,
  a.transit, a.nearby, a.market, a.waiting, a.commute, a.updated_at,
  a.published_version,
  case when v.id is null then 'UNVERIFIED' else 'VERIFIED' end as status,
  v.extraction
from announcements a
left join announcement_versions v
  on v.announcement_id = a.id and v.version = a.published_version and v.status = 'VERIFIED'
where a.apply_end is null or a.apply_end >= current_date - 7;

grant select on app_announcements to anon, authenticated;
