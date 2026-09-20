-- 대출 룰 시드. 금액·금리는 2026-09 기준 주택도시기금 공시를 옮겨 적기 전의 자리표시 값이다.
-- 실제 값으로 바꾸고 as_of_date를 갱신한 뒤 적용한다 (문서: 대출 룰 최신성 60/90일 알림).
insert into loan_products (id, name, provider, kind, rule_groups, eligibility, max_amount, ltv, dsr_limit, term_months, interest_only, rate_table, as_of_date, source_url)
values
(
  'hf-buteomok',
  '버팀목 전세자금대출',
  '주택도시기금',
  'rental_deposit',
  '[{"id":"basic","mode":"all_of","label":"기본 요건"}]',
  '[
    {"group_id":"basic","category":"housing","operator":"gte","value":0,"unit":"months","source":{"page":1,"text":"무주택 세대주"},"confidence":1,"verified":true},
    {"group_id":"basic","category":"income","operator":"lte","value":4166667,"unit":"KRW_monthly","source":{"page":1,"text":"부부합산 연소득 5천만 원 이하 (월 환산)"},"confidence":1,"verified":true},
    {"group_id":"basic","category":"asset","operator":"lte","value":345000000,"unit":"KRW","source":{"page":1,"text":"순자산 3.45억 이하 (확인 필요)"},"confidence":1,"verified":true}
  ]',
  120000000, 0.7, null, 24, true,
  '[{"max_income":2000000,"annual_rate":0.023},{"max_income":3333333,"annual_rate":0.026},{"annual_rate":0.029}]',
  '2026-09-01',
  'https://nhuf.molit.go.kr/'
),
(
  'hf-buteomok-newlywed',
  '신혼부부 전용 버팀목 전세자금대출',
  '주택도시기금',
  'rental_deposit',
  '[{"id":"basic","mode":"all_of","label":"기본 요건"}]',
  '[
    {"group_id":"basic","category":"housing","operator":"gte","value":0,"unit":"months","source":{"page":1,"text":"무주택 세대주"},"confidence":1,"verified":true},
    {"group_id":"basic","category":"marriage","operator":"lte","value":7,"unit":"years","source":{"page":1,"text":"혼인기간 7년 이내 또는 3개월 이내 결혼 예정"},"confidence":1,"verified":true},
    {"group_id":"basic","category":"income","operator":"lte","value":6250000,"unit":"KRW_monthly","source":{"page":1,"text":"부부합산 연소득 7,500만 원 이하 (월 환산)"},"confidence":1,"verified":true}
  ]',
  300000000, 0.8, null, 24, true,
  '[{"max_income":2000000,"annual_rate":0.015},{"max_income":4166667,"annual_rate":0.02},{"annual_rate":0.027}]',
  '2026-09-01',
  'https://nhuf.molit.go.kr/'
),
(
  'hf-youth-buteomok',
  '청년전용 버팀목 전세자금대출',
  '주택도시기금',
  'rental_deposit',
  '[{"id":"basic","mode":"all_of","label":"기본 요건"}]',
  '[
    {"group_id":"basic","category":"housing","operator":"gte","value":0,"unit":"months","source":{"page":1,"text":"무주택 세대주"},"confidence":1,"verified":true},
    {"group_id":"basic","category":"age","operator":"between","value":[19,34],"unit":"years","source":{"page":1,"text":"만 19세 이상 34세 이하"},"confidence":1,"verified":true},
    {"group_id":"basic","category":"income","operator":"lte","value":4166667,"unit":"KRW_monthly","source":{"page":1,"text":"연소득 5천만 원 이하 (월 환산)"},"confidence":1,"verified":true}
  ]',
  200000000, 0.8, null, 24, true,
  '[{"max_income":1666667,"annual_rate":0.02},{"max_income":3333333,"annual_rate":0.023},{"annual_rate":0.031}]',
  '2026-09-01',
  'https://nhuf.molit.go.kr/'
)
on conflict (id) do update set
  name = excluded.name, rule_groups = excluded.rule_groups, eligibility = excluded.eligibility,
  max_amount = excluded.max_amount, ltv = excluded.ltv, rate_table = excluded.rate_table,
  as_of_date = excluded.as_of_date, source_url = excluded.source_url;
