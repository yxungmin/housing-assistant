-- 신고 흐름을 끝까지 확인하기 위한 테스트 공고 1건.
-- 추출 비용 없이(LLM 없이) 앱 → 신고 전송 → 검수 큐 → 처리 → 앱 반영을 시험할 수 있다.
-- 실제 공고가 아니다. 지우려면 파일 맨 아래 delete를 쓴다.
--
-- 값은 SH 제51차 장기전세 공고(2026-08-31)에서 가져왔고 pdf_url도 실제 주소라 "원문 열기"까지 확인된다.

insert into announcements (id, lh_id, provider, title, housing_type, region_code,
                           notice_date, apply_start, apply_end, pdf_url, lat, lng, latest_version)
values (
  '00000000-0000-4000-8000-000000000001',
  'TEST-SAMPLE-1', 'SH',
  '[테스트] 제51차 장기전세주택 입주자 모집공고',
  'long_term_rental', '11',
  current_date - 3, current_date + 2, current_date + 14,
  'https://www.i-sh.co.kr/main/com/file/innoFD.do?brdId=GS0401&seq=309467&fileTp=A&fileSeq=1',
  37.4923, 127.0292, 1
)
on conflict (provider, lh_id) do nothing;

insert into announcement_versions (id, announcement_id, version, status, extracted_at, checks, extraction)
values (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-000000000001',
  1, 'UNVERIFIED', now(), '[]'::jsonb,
  $json${
    "title": "[테스트] 제51차 장기전세주택 입주자 모집공고",
    "housing_type": "long_term_rental",
    "address": "서울특별시 강남구 세곡동 일원",
    "schedule": { "notice_date": "2026-08-31", "winner_announce": "2027-03-05" },
    "notes": ["테스트용으로 넣은 공고입니다. 실제 모집공고가 아닙니다."],
    "tracks": [
      {
        "name": "일반공급",
        "households": 22,
        "unit_types": [{ "name": "59㎡", "exclusive_area_m2": 59.9, "households": 22 }],
        "rule_groups": [{ "id": "basic", "mode": "all_of", "label": "기본 요건" }],
        "rules": [
          { "group_id": "basic", "category": "residence", "applies_to": {}, "operator": "in",
            "value": ["11"], "unit": "region_code", "confidence": 0.9, "verified": false,
            "source": { "page": 20, "text": "입주자 모집 공고일 현재 서울특별시에 거주하는 성년자인 무주택세대구성원" } },
          { "group_id": "basic", "category": "housing", "applies_to": {}, "operator": "gte",
            "value": 0, "unit": "months", "confidence": 0.95, "verified": false,
            "source": { "page": 21, "text": "무주택세대구성원: 공고일 현재 세대원 전원이 주택을 소유하고 있지 않은 세대의 구성원" } },
          { "group_id": "basic", "category": "age", "applies_to": {}, "operator": "gte",
            "value": 19, "unit": "years", "confidence": 0.9, "verified": false,
            "source": { "page": 20, "text": "민법상 미성년자(만19세 미만)·외국인은 신청할 수 없습니다." } },
          { "group_id": "basic", "category": "asset", "applies_to": {}, "operator": "lte",
            "value": 662000000, "unit": "KRW", "confidence": 0.85, "verified": false,
            "source": { "page": 24, "text": "총자산 가액 합산: 66,200만원 이하" } }
        ],
        "pricing": [
          { "unit_type": "59㎡", "kind": "rental", "deposit": 514020000, "monthly_rent": 0,
            "maintenance_estimate": 120000,
            "source": { "page": 15, "text": "세곡2지구 59 일반 22 514,020(천원)" } }
        ]
      }
    ]
  }$json$::jsonb
)
on conflict (announcement_id, version) do nothing;

-- 자동 검증을 통과한 것으로 보고 게시한다 (수집기가 하는 일과 같다)
select auto_publish_version('00000000-0000-4000-8000-0000000000a1');

select id, title, status, apply_end, pdf_url is not null as 원문있음
from app_announcements where lh_id = 'TEST-SAMPLE-1';

-- 정리할 때:
-- delete from announcements where lh_id = 'TEST-SAMPLE-1';
