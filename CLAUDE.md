# housing-assistant

공공주택 비서 — LH 공고 매칭·주거비 계산 앱. 설계 문서: https://claude.ai/code/artifact/54a25418-ac2c-403c-9c5d-0169acb231fc

## 원칙 (문서에서 그대로)
- AI(LLM)는 수집기의 PDF → JSON 추출 한 곳에서만 쓴다. 매칭·계산은 `packages/engine`의 순수 함수로, 네트워크·LLM 없이 기기에서 돈다.
- 사용자 프로필(소득·자산 등)은 서버에 저장하지 않는다. 서버 테이블은 공고 데이터 + 구독 상태 + 푸시 토큰만.
- 확정적 문구 금지: "신청 가능"·"자격 충족" 대신 "조건 일치"·"충족 예상". 모든 숫자에 출처(공고문 페이지, 대출 기준일).
- 원래 계획은 M3 벤치마크 통과 후 앱 착수였지만, 사용자 결정(2026-09-20)으로 `apps/mobile`을 로컬 데이터(추출 초안 5건)로 먼저 만들고 있다. 벤치마크와 정답 데이터 작업은 계속 병행한다.

## 구조
- `packages/schema` zod Rule Schema. 타입의 단일 소스. `npm run schema:json`으로 JSON Schema 생성.
- `packages/engine` 매칭(`match.ts`)·비용(`cost.ts`). 룰은 `rule_groups`로 묶이고 `any_of`는 하나만 맞아도 통과. 프로필 값이 없으면 `NEEDS_CHECK`.
- `collector` LH API → PDF → 텍스트/섹션 → Claude 구조화 추출(`llm/extract.ts`) → `autoChecks` → Supabase(`db/supabase.ts`, 버저닝).
- `supabase/migrations` 테이블·RLS·`publish_version()`. `supabase/seed` 대출 상품.
- `benchmark` 정답 fixtures + `npm run benchmark`. PDF는 `npm run benchmark:fetch`로 LH API에서 받고 `benchmark/pdfs/meta.json`에 공고 메타(지역·일정·주소)가 남는다. `npm run inspect -- <pdf> --extract`가 초안(`benchmark/output/*.draft.json`)을 만든다.
- `apps/mobile` Expo 57 + Expo Router 앱. 화면은 `src/components/ui.tsx` 공통 컴포넌트(Screen·Card·BigNumber·Tag/Chip·ConditionRow·BottomCTA·BottomSheet) 조합으로만, 색은 `src/theme/tokens.ts` 토큰만. 매칭·계산은 `@housing/engine` 그대로. 데이터는 `src/data/announcements.ts`의 외부 스토어(`useAnnouncements`): 번들 `data/announcements.json`(`npm run app:data`) → 캐시 → Supabase `app_announcements` 뷰(`src/data/remote.ts`, `apps/mobile/.env`의 `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`가 있을 때만) 순으로 교체된다. 구독 규칙·결제 어댑터는 `src/lib/billing.ts`(지금은 로컬 목, M8에서 스토어 구현으로 교체), 알림은 `src/lib/notifications.ts`(관심 공고 마감 3일 전 기기 예약 + 푸시 토큰 등록). 직장 위치는 시군구 선택 → `src/lib/places.ts` 대표 좌표. 소득 도우미는 엔진 `income.ts`(건보료 역산). `npm run app`으로 실행.
- `design/screens-mockup.html` 화면 시안(아티팩트). 앱 토큰·컴포넌트의 원본.

## 명령
```bash
npm test && npm run typecheck        # 커밋 전
npm run inspect -- benchmark/pdfs/001.pdf [--text] [--extract]   # PDF 점검 / 정답 초안
npm run lh:dump                      # LH API 원본 응답 확인 (LH_API_KEY 필요)
npm run benchmark                    # 추출 벤치마크 (ANTHROPIC_API_KEY 필요)
npm run benchmark:fetch -- --count 10   # LH API에서 공고문 PDF 추가 수집 (LH_API_KEY 필요)
npm run app:data                     # 초안/정답 → 앱 번들 데이터
```

## 규칙
- 스키마를 바꾸면 `packages/schema` 테스트 + 엔진 테스트 + `benchmark/fixtures/000.example.json`을 함께 고친다.
- 추출 프롬프트(`collector/src/llm/extract.ts`)를 바꾸면 `EXTRACTION_PROMPT_VERSION`을 올리고 벤치마크를 다시 돌린다.
- LH API 응답 필드명은 `collector/src/lh/api.ts` 한 곳에만 둔다. 미지 코드는 `mapping.ts` 표에 한 줄 추가.
- 분양(sale) 비용 계산은 V0.2. 엔진은 rental만 받는다.
- 앱 상대 import에 `.js` 확장자를 붙이지 않는다 (Metro가 .ts로 못 푼다).
- 수집기 `insertVersion`은 정규화 테이블과 함께 `announcement_versions.extraction`(jsonb)도 채운다. 앱은 그 jsonb만 읽는다.
- 건강보험료율 등 연도별 상수는 엔진 한 곳(`income.ts`)에 기준일과 함께 둔다.
- 커밋 메시지는 한국어 또는 영어 한 줄 요약 + 필요하면 본문.
