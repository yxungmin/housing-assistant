-- 당첨자 발표 알림을 실제로 받아 보기 위한 테스트 공고 1건.
--
-- 발표일을 "내일"로 넣는다. lib/reminders.ts가 3일 전·1일 전·당일 09:00에 거는데,
-- 그중 "1일 전"이 오늘 09:00이 되어 오늘 안에 확인할 수 있다.
-- (오늘 09:00이 이미 지났다면 내일 09:00의 "당일" 알림으로 확인된다.)
--
-- 앱에서 이 공고를 열고 "이 공고에 신청했어요"를 눌러야 알림이 걸린다. 알림 권한도 켜져 있어야 한다.
-- 실제 공고가 아니다. 지우려면 파일 맨 아래 delete를 쓴다.

insert into announcements (id, lh_id, provider, title, housing_type, region_code,
                           notice_date, apply_start, apply_end, latest_version)
values (
  '00000000-0000-4000-8000-000000000002',
  'TEST-ANNOUNCE-SOON', 'SH',
  '[테스트] 발표 알림 확인용 공고',
  'long_term_rental', '11',
  current_date - 10, current_date - 5, current_date + 20, 1
)
on conflict (provider, lh_id) do update
  set apply_end = excluded.apply_end, latest_version = excluded.latest_version;

insert into announcement_versions (id, announcement_id, version, status, extracted_at, checks, extraction)
values (
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-000000000002',
  1, 'UNVERIFIED', now(), '[]'::jsonb,
  jsonb_build_object(
    'title', '[테스트] 발표 알림 확인용 공고',
    'housing_type', 'long_term_rental',
    'address', '서울특별시 강남구 세곡동 일원',
    -- 여기가 핵심: 발표일을 내일로 둔다
    'schedule', jsonb_build_object('notice_date', to_char(current_date - 10, 'YYYY-MM-DD'),
                                   'winner_announce', to_char(current_date + 1, 'YYYY-MM-DD')),
    'notes', jsonb_build_array('알림 확인용으로 넣은 공고입니다. 실제 모집공고가 아닙니다.'),
    'tracks', jsonb_build_array(jsonb_build_object(
      'name', '일반공급',
      'households', 10,
      'unit_types', jsonb_build_array(jsonb_build_object('name', '59㎡', 'exclusive_area_m2', 59.9, 'households', 10)),
      'rule_groups', jsonb_build_array(jsonb_build_object('id', 'basic', 'mode', 'all_of', 'label', '기본 요건')),
      'rules', jsonb_build_array(jsonb_build_object(
        'group_id', 'basic', 'category', 'residence', 'applies_to', '{}'::jsonb, 'operator', 'in',
        'value', jsonb_build_array('11'), 'unit', 'region_code', 'confidence', 0.9, 'verified', false,
        'source', jsonb_build_object('page', 1, 'text', '서울특별시에 거주하는 무주택세대구성원'))),
      'pricing', jsonb_build_array(jsonb_build_object(
        'unit_type', '59㎡', 'kind', 'rental', 'deposit', 120000000, 'monthly_rent', 0,
        'source', jsonb_build_object('page', 1, 'text', '전세보증금 1억 2천만 원')))
    ))
  )
)
on conflict (id) do update set extraction = excluded.extraction, extracted_at = now();

select auto_publish_version('00000000-0000-4000-8000-0000000000a2');

select lh_id, apply_end, extraction -> 'schedule' ->> 'winner_announce' as 발표일, status
from app_announcements where lh_id = 'TEST-ANNOUNCE-SOON';

-- 지울 때:
-- delete from announcement_versions where announcement_id = '00000000-0000-4000-8000-000000000002';
-- delete from announcements where id = '00000000-0000-4000-8000-000000000002';
