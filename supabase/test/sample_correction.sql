-- 테스트 공고를 "정정"한다 (v2 게시). sample_announcement.sql을 먼저 넣어 두어야 한다.
-- 신고를 받아 값을 고쳤거나 공고가 정정된 상황과 같은 모양이다 — 앱은 관심 공고의 변경을 알아채야 한다.
--   보증금 5억 1,402만 → 4억 3,524만 / 마감 +7일

insert into announcement_versions (id, announcement_id, version, status, extracted_at, checks, extraction)
select
  '00000000-0000-4000-8000-0000000000a2',
  announcement_id, 2, 'UNVERIFIED', now(), checks,
  jsonb_set(extraction, '{tracks,0,pricing,0,deposit}', '435240000'::jsonb)
from announcement_versions
where id = '00000000-0000-4000-8000-0000000000a1'
on conflict (announcement_id, version) do nothing;

update announcements set apply_end = apply_end + 7
 where lh_id = 'TEST-SAMPLE-1';

select auto_publish_version('00000000-0000-4000-8000-0000000000a2');

select status, published_version, apply_end,
       extraction->'tracks'->0->'pricing'->0->>'deposit' as 보증금
from app_announcements where lh_id = 'TEST-SAMPLE-1';

-- 되돌리려면:
-- delete from announcement_versions where id = '00000000-0000-4000-8000-0000000000a2';
-- update announcements set published_version = 1, apply_end = apply_end - 7 where lh_id = 'TEST-SAMPLE-1';
