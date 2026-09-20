# 벤치마크 30건 (M2·M3)

행복주택·국민임대·신혼희망타운·매입임대·공공분양·복잡한 공고 각 5건.

## 구성

```
benchmark/
├─ pdfs/            공고문 PDF (git 제외, Supabase Storage 또는 로컬)
├─ fixtures/        정답 JSON — 파일 하나 = 공고 하나
│   └─ 000.example.json   형식 예시 (벤치마크에서 제외됨)
└─ output/          실행 결과 (git 제외)
```

## 확보한 PDF (공개 URL, `pdfs/`는 git 제외이므로 다시 받을 때 참고)

| id | 공고 | 유형 | 출처 |
| --- | --- | --- | --- |
| 001 | 과천지식정보타운 S-11BL 행복주택(리츠) 입주자 모집공고 (2024-12-20) | 행복주택 | opcl.s3.amazonaws.com (정책 공고 아카이브) |
| 002 | 관악봉천 행복주택 입주자 모집 (2024-08) | 행복주택 | opcl.s3.amazonaws.com |
| 003 | 2024년 서울특별시 영구임대주택 예비입주자 모집 (LH, 수정) | 영구임대 | opcl.s3.amazonaws.com |
| 004 | 2024년 LH 청년특화형 주택(아츠스테이 성산2호) 입주자 모집공고 | 특화형 매입임대 | opcl.s3.amazonaws.com |
| 005 | 군산나운4 영구임대주택 입주자격완화 예비입주자 모집 공고 (2026-09-18) | 영구임대 | LH API 첨부 `lhFile.do?fileid=68659195` (PAN_ID 2015122300020801) |

5건 모두 텍스트 레이어가 있어 OCR 없이 추출된다 (58쪽 88,000자 / 33쪽 50,000자 / 18쪽 27,000자 / 24쪽 27,000자 / 34쪽 41,000자).
나머지 25건은 LH API로 받는다: `npm run lh:dump`가 출력하는 공고문 PDF URL을 `curl -L -o benchmark/pdfs/<id>.pdf "<url>"`로 저장한다.
유형별 5건 목표: 행복주택·국민임대·신혼희망타운·매입임대·공공분양·복잡한 공고(정정공고, 다계층 혼합).
정답 초안은 `npm run inspect -- benchmark/pdfs/001.pdf --extract`로 만들고 사람이 고친다.

## 정답 만들기

1. `pdfs/<id>.pdf`를 둔다.
2. `fixtures/000.example.json`을 복사해 `<id>.json`으로 만들고, 사람이 PDF를 읽으며 `gold`를 채운다.
   - 룰은 조건 하나에 하나. 소득은 원/월 절대 금액. 대안 조건은 `any_of` 그룹.
   - 모든 룰·가격에 `source.page`를 넣는다 (틀려도 지표엔 영향 없지만 검수 화면이 쓴다).
3. `npm run benchmark -- --only <id>`로 그 건만 돌려 본다.

## 실행

```bash
npm run benchmark
EXTRACTION_MODEL=claude-sonnet-5 npm run benchmark   # 모델 비교
```

`output/report.<model>.json`에 지표와 케이스별 상세가 남는다. 프롬프트(`collector/src/llm/extract.ts`)를 바꾸면
`EXTRACTION_PROMPT_VERSION`을 올리고 전체를 다시 돌린 뒤 비교한다.

## 목표 (문서 "품질 기준과 검증")

| 지표 | 목표 |
| --- | --- |
| 룰 단위 정확 추출률 | 95% 이상 |
| 공고 단위 완전 일치율 | 80% 이상 |
| 가격표 정확 추출률 | 98% 이상 |
| 누락률 | 3% 이하 |
| 없는 조건 생성률 | 1% 이하 |
| 공고 1건 처리 시간 | 5분 이내 |
