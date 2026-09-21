# 공공주택 비서 (housing-assistant)

저장소: https://github.com/yxungmin/housing-assistant (공개 — GitHub Actions 무료 분을 쓰기 위해)

사용자가 나이·소득·자산 등 조건을 입력하면 LH 공공주택 공고 중 조건에 맞는 공고를 보여주고,
공고별 예상 주거비를 계산해 주는 모바일 앱. 기획·설계는 [MVP 개발 문서](https://claude.ai/code/artifact/54a25418-ac2c-403c-9c5d-0169acb231fc)를 따른다.

핵심 원칙: **AI는 수집 단계(빌드 타임)에만** 쓰고, 매칭과 계산은 기기에서 결정론적으로 돈다. 민감한 개인정보는 서버에 저장하지 않는다.

## 구조

```
repo/
├─ packages/schema     Rule Schema (zod) — 공고·트랙·자격 룰·가격·프로필·대출 상품 타입의 단일 소스
├─ packages/engine     매칭 엔진 + 비용 계산 엔진 (순수 함수, 테스트)
├─ collector/          GitHub Actions 워커: LH API → PDF → LLM 추출 → 검증 → Supabase
├─ supabase/           migrations (테이블·RLS·검수 함수), seed (loan_products)
├─ benchmark/          추출 벤치마크 30건 (정답 fixtures, 리포트)
└─ apps/mobile         (M6 이후) Expo 앱 — M1~M5 통과 전에는 만들지 않는다
```

## 시작

```bash
npm install
npm test          # schema · engine · collector 유닛 테스트
npm run typecheck
```

## 마일스톤 진행

| 단계 | 상태 | 이 저장소에서 할 일 |
| --- | --- | --- |
| M1 데이터 확보 | 진행 | `.env`에 `LH_API_KEY` → `npm run lh:dump`로 응답 필드 확인, `collector/src/lh/api.ts` 매핑 수정, PDF 30건을 `benchmark/pdfs/`에 |
| M2 Rule Schema | 코드 완료 | `benchmark/fixtures/`에 정답 30건 수작업 ([benchmark/README.md](benchmark/README.md)) |
| M3 추출 벤치마크 | 코드 완료 | `npm run benchmark` → 룰 95% / 공고 80% / 가격 98% 넘기기 |
| M4 수집기 | 코드 완료 | Supabase 프로젝트에 `supabase/migrations` 적용, GitHub Secrets 설정, 워크플로 실행 |
| M5 엔진 | 코드 완료 | 벤치마크 30건 × 프로필 5종 결과를 수작업 판정과 대조 |
| M6~ 앱 | 대기 | M3 목표 미달이면 시작하지 않음 |

## 환경 변수

`.env.example`을 `.env`로 복사한다. GitHub Actions에서는 같은 이름의 Secrets를 쓴다.

**`EXTRACTION_ENABLED`는 기본 꺼짐이다.** 돈이 나가는 곳은 LLM 추출 한 군데뿐이라(공고 1건 약 1,300원)
켜는 것을 명시적인 행동으로 뒀다. 꺼져 있으면 수집기는 목록·신규 판정까지만 하고, 벤치마크·`inspect --extract`도 거부한다.
저장소는 공개로 둔다 (비공개는 Actions 무료 2,000분/월을 넘긴다). 키는 코드에 넣지 않는다.

## 설계 메모

- 수정 공고는 새 `announcement_versions` 행으로 재추출된다. 앱은 `announcements.published_version`만 읽으므로
  검수(`publish_version()`)가 끝나기 전까지 이전 VERIFIED 버전이 그대로 보인다.
- 자격 룰은 `rule_groups`로 묶인다. `any_of` 그룹은 하나만 맞아도 통과(예: 혼인 7년 이내 또는 6세 이하 자녀).
- 사용자 프로필 필드에 없는 category는 엔진이 `NEEDS_CHECK`로 처리한다. 앱은 "입력하면 판별 가능"으로 안내한다.
- 분양(sale)은 V0.1에서 매칭만 하고 계산은 비활성이다.
