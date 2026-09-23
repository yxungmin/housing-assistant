# housing-assistant

공공주택 비서 — LH 공고 매칭·주거비 계산 앱. 설계 문서: https://claude.ai/code/artifact/54a25418-ac2c-403c-9c5d-0169acb231fc

## 원칙 (문서에서 그대로)
- **추출(LLM)은 기본 꺼짐이다.** `EXTRACTION_ENABLED=true`가 없으면 `extractFromText`가 거부한다 — 수집기·벤치마크·inspect 어느 경로로도 과금되지 않는다.
  테스트 기간(2026-09-21~)에는 `collect.yml`의 cron도 꺼 뒀다. 켜는 것은 명시적인 행동이어야 한다 (공고 1건 약 1,300원).
- AI(LLM)는 수집기의 PDF → JSON 추출 한 곳에서만 쓴다. 매칭·계산은 `packages/engine`의 순수 함수로, 네트워크·LLM 없이 기기에서 돈다.
- 사용자 프로필(소득·자산 등)은 서버에 저장하지 않는다. 서버 테이블은 공고 데이터 + 구독 상태 + 푸시 토큰만.
- 확정적 문구 금지: "신청 가능"·"자격 충족" 대신 "조건 일치"·"충족 예상". 모든 숫자에 출처(공고문 페이지, 대출 기준일).
- 원래 계획은 M3 벤치마크 통과 후 앱 착수였지만, 사용자 결정(2026-09-20)으로 `apps/mobile`을 로컬 데이터(추출 초안 5건)로 먼저 만들고 있다. 벤치마크와 정답 데이터 작업은 계속 병행한다.

## 할 일
남은 작업과 결정 대기 항목은 `TODO.md`. 작업을 끝내면 거기 체크를 옮긴다.

## 구조
- `packages/schema` zod Rule Schema. 타입의 단일 소스. `npm run schema:json`으로 JSON Schema 생성.
- `packages/engine` 매칭(`match.ts`)·비용(`cost.ts`). 룰은 `rule_groups`로 묶이고 `any_of`는 하나만 맞아도 통과. 프로필 값이 없으면 `NEEDS_CHECK`.
  추출이 놓친 요건을 막는 안전망이 둘 있다. `regionGuard`는 거주 요건을 못 읽고 공고 지역이 다르면 "확인 필요"를 얹고 `is_match`를 끈다
  (수도권 11·28·41은 한 생활권으로 묶는다). `incomeGuard`는 소득 규칙이 없는 임대 트랙에 "확인 필요"를 얹되 후보에서 빼지는 않는다.
  둘 다 MISMATCH로 자르지 않는다 — 자격이 되는 사람에게서 공고를 감추면 그 오류는 아무도 신고하지 못한다.
  `statusGuard`는 영구임대 1순위(제목으로 가린다 — 유형 코드가 장기전세와 같다)에 계층 규칙이 없으면 대상 계층 한 줄을 얹고,
  입력한 계층이 대상이 아니거나 모르면 추천에서 뺀다(`status_uncertain`). 역시 MISMATCH로 자르지 않는다 — 입력 항목에 없는 1순위 계층이 있다.
  무주택 기간은 `homeless.ts`가 청약 가점제 규칙으로 계산한다(만 30세부터, 그 전 혼인이면 혼인신고일부터). 사람이 적은 값보다 규칙이 이긴다.
  룰의 `verified`(사람 검수 여부)는 판정에 쓰지 않는다 — 검수 전이라고 숨기면 자격이 되는 사람에게 공고를 감추게 된다. 화면이 사실대로 알린다.
- `collector` 기관 목록 → PDF → 텍스트/섹션 → Claude 구조화 추출(`llm/extract.ts`) → `autoChecks` → Supabase(`db/supabase.ts`, 버저닝). 기관 어댑터는 `sources.ts` 한 곳(LH는 공공데이터포털 API, SH는 게시판 HTML 파싱 `sh/api.ts`). 수집 범위는 `COLLECT_PROVIDERS`·`COLLECT_REGIONS`(기본 LH,SH / 서울·경기)로 줄여 비용을 통제한다.
- `supabase/functions/transit` 흩어진 집까지의 대중교통 소요를 카카오에 물어 캐시한다(`commute_cache`).
  앱이 직접 못 부르는 이유는 REST 키를 앱에 넣을 수 없어서고, 미리 계산 못 하는 이유는
  집 주소 176곳 × 시군구 56곳 = 9,856회인데 하루 한도가 1,000회라서다. 고른 집 하나만 부르면 1회다.
  저장하는 것은 (공고, 집, 출발 시군구) → 분뿐이고 출발점이 시군구 중심이라 사용자를 가리키지 않는다.
  배포·키 설정은 `supabase/README.md` 2-2.
- `supabase/migrations` 테이블·RLS. 게시는 자동이다(0006): 자동 검증을 통과하면 `auto_publish_version()`이 바로 내보내고,
  `publish_version()`은 "사람이 대조했다"는 도장만 찍는다. 사람을 게시 경로에 두면 하루만 못 봐도 새 공고가 앱에 안 뜬다.
  자동 검증 지적은 둘로 갈린다 — `conflict_reasons`(게시 보류) / `checks`(게시하되 앱에 알림). `autoChecks`의 `blocking` 플래그가 기준.
  마이그레이션을 고치면 `npm run db:check`로 빈 DB에 처음부터 적용해 본다 (`supabase/test/`). 뷰는 `create or replace` 대신 지우고 다시 만든다.
  Supabase 프로젝트를 붙이는 절차는 `supabase/README.md`. 신고는 `issue_reports`(0005에서 대상·상태·처리 결과 추가)와
  결과 조회용 `issue_report_status` 뷰. `supabase/seed` 대출 상품. 좌표·역·정류장·주변 인프라는 수집 때 Kakao Local 1회(`geo/kakao.ts`) — `KAKAO_REST_API_KEY`가 없으면 전부 빈 채로 저장되고 앱은 그 섹션을 숨긴다. `nearby`는 0007에서 더한 별도 컬럼이다.
- `benchmark` 정답 fixtures + `npm run benchmark`. PDF는 `npm run benchmark:fetch`로 LH API에서 받고 `benchmark/pdfs/meta.json`에 공고 메타(지역·일정·주소)가 남는다. `npm run inspect -- <pdf> --extract`가 초안(`benchmark/output/*.draft.json`)을 만든다.
  초안을 정답으로 올리기 전에 `npm run fixture:check`가 룰·가격마다 인용문이 그 쪽에 실제로 있는지, 값이 인용문과 맞는지 대조한다
  (`benchmark/output/*.check.json`). 통과는 승격의 조건일 뿐이고 확정은 사람이 한다 — `--promote --reviewed-by <이름>`.
- `apps/mobile` Expo 57 + Expo Router 앱. 화면은 `src/components/ui.tsx` 공통 컴포넌트(Screen·Card·BigNumber·Tag/Chip·ConditionRow·BottomCTA·BottomSheet) 조합으로만, 색은 `src/theme/tokens.ts` 토큰만. 매칭·계산은 `@housing/engine` 그대로. 데이터는 `src/data/announcements.ts`의 외부 스토어(`useAnnouncements`): 번들 `data/announcements.json`(`npm run app:data`) → 캐시 → Supabase `app_announcements` 뷰(`src/data/remote.ts`, `apps/mobile/.env`의 `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`가 있을 때만) 순으로 교체된다. 구독 규칙·결제 어댑터는 `src/lib/billing.ts`(지금은 로컬 목, M8에서 스토어 구현으로 교체), 알림은 `src/lib/notifications.ts`(관심 공고 마감 3일 전 기기 예약 + 푸시 토큰 등록). 직장 위치는 시군구 선택 → `src/lib/places.ts` 대표 좌표. 신혼·예비신혼부부는 배우자 직장(`workplace_partner`)도 받고, "직장 근처" 필터·정렬은 두 사람 중 더 먼 쪽(`commuteKm`)을 쓴다. 소득 도우미는 엔진 `income.ts`(건보료 역산).
  위치·교통 문구는 `src/lib/commute.ts` 한 곳에 둔다. 우리가 가진 건 최근접 역·정류장까지의 **직선거리**뿐이라 화면도 거기까지만 말한다 — 경로·환승·소요 시간은 교통 API를 붙여야 나온다. 지도는 시스템 지도 앱으로 넘긴다.
  "이 숫자 이상해요"는 항목 단위다: 조건·임대조건을 누르면 근거 원문이 펼쳐지고 거기서 신고한다(`components/ReportSheet.tsx`).
  신고는 `src/lib/reports.ts`로 기기에 먼저 쌓이고 Supabase가 붙으면 `appState`가 올려 보낸 뒤 처리 결과를 받아 온다.
  같은 자리에서 원문 공고문을 연다(`src/lib/source.ts`, `announcements.pdf_url`). 쪽 이동(`#page`)은 뷰어에 따라 무시된다.
  공고문 파일이 없으면 기관의 공고 상세 페이지(`detail_url`)로 연다 — 둘 다 외부 브라우저다.
  기관이 올린 그림(`images`: 위치도·단지조감도·배치도)은 `components/NoticeImages.tsx`. 우리가 공고문에서 뽑은 그림이 아니라
  기관이 이미지 파일로 준 것만 넣는다 — 화면도 그렇게 말한다. 평면도는 여기 없다(공고문 PDF 안에 있다).
  공고 상태는 셋이다: `VERIFIED`(사람이 대조함) · `AUTO`(자동 추출·검증만) · `UNVERIFIED`(조건을 못 읽음 — 매칭·계산 안 함).
  사람이 본 것만 VERIFIED다. `app-data.ts`는 `benchmark/fixtures/`에서 온 것만 그렇게 표시하고, 자동 검증 지적은 `checks`로 앱에 그대로 내려보낸다.
  `npm run app`으로 실행.
  `npm run app:data`는 `benchmark/output`의 초안을 읽어 번들 데이터를 다시 쓴다. 초안은 커밋하지 않는 생성물이라
  없는 작업본에서 돌리면 번들 12건이 통째로 날아갔었다(2026-09-21) — 지금은 읽은 공고가 0건이면 쓰지 않고 멈춘다.
- `collector/src/review-server.ts` 검수 뷰어(4310). 추출 검수 화면과 신고 큐 두 가지.
  신고 큐는 `issue_reports`를 읽어 네 가지로 끝낸다(공고문과 같음·수정함·공고 정정·신고 아님).
  거기 적은 한 줄이 앱의 신고 내역에 그대로 보인다. Supabase가 없으면 큐만 꺼지고 나머지는 그대로 돈다.
- `design/screens-mockup.html` 화면 시안(아티팩트). 앱 토큰·컴포넌트의 원본.

## 명령
```bash
npm test && npm run typecheck        # 커밋 전
npm run inspect -- benchmark/pdfs/001.pdf [--text] [--extract]   # PDF 점검 / 정답 초안
npm run lh:dump                      # LH API 원본 응답 확인 (LH_API_KEY 필요)
npm run benchmark                    # 추출 벤치마크 (ANTHROPIC_API_KEY 필요)
npm run benchmark:fetch -- --count 10   # LH API에서 공고문 PDF 추가 수집 (LH_API_KEY 필요)
npm run app:data                     # 초안/정답 → 앱 번들 데이터
npm run app:enrich [-- --links]      # 번들에 원문 링크·그림·좌표·시세·대기·통근 (LLM 없음, --links는 링크·그림만)
npm run simulate [-- --full]         # 프로필 10종 × 지금 공고로 매칭 점검 (LLM 없음)
npm run db:check                     # 빈 Postgres에 마이그레이션 전체 적용 + 동작 확인 (Docker 필요)
npm run fixture:check -- 018         # 초안 ↔ 공고문 PDF 1차 대조 (사람 검수 전)
npm run review                       # 검수 뷰어 4310 — 추출 검수 + 신고 큐
npm run output:size                  # 추출 출력이 어디서 커지는지 (비용의 70%가 출력 토큰)
npm run pdf:rehost [-- --apply]      # 기관 서버를 가리키는 공고문을 우리 Storage로 옮긴다 (내려받기 방지)
```

## 규칙
- 스키마를 바꾸면 `packages/schema` 테스트 + 엔진 테스트 + `benchmark/fixtures/000.example.json`을 함께 고친다.
- 추출 프롬프트(`collector/src/llm/extract.ts`)를 바꾸면 `EXTRACTION_PROMPT_VERSION`을 올리고 벤치마크를 다시 돌린다.
- 매입임대·전세임대는 집이 흩어져 있다. 주택별 소재지·면적·임대조건은 공고문이 아니라 별도 엑셀 첨부에 있고,
  `collector/src/units/list.ts`가 읽어 `Announcement.units`에 담는다(`xlsx.ts`는 zlib만 쓰는 최소 리더).
  좌표는 주소마다 한 번만 찍는다(한 건물에 여러 세대). 그 호출이 역·정류장·주변 시설까지 같이 주므로 집에 그대로 붙인다.
  앱은 `lib/units.ts`로 다루고,
  이런 공고에서는 위치·통근 섹션을 끄고(좌표가 하나일 수 없다) 예상 주거비의 선택 대상이 주택형이 아니라 집이 된다.
- 단지 그림은 LH 상세의 `dsSbdAhfl`에서 온다(첨부 `dsAhflInfo`와 별개 데이터셋).
  `AHFL_URL`은 그림이 아니라 그림 한 장을 담은 HTML 페이지다. 같은 fileid를 `lhFile.do`에 넣어야 그림 파일이 나온다(`resolveImages`).
- 기관 응답 필드명은 기관 모듈 한 곳에만 둔다(`lh/api.ts`, `sh/api.ts`). 주택유형 매핑은 `lh/mapping.ts` 공통 표를 LH·SH가 같이 쓰고, 미지 값은 `other`로 두고 한 줄 추가한다.
- 새 공급기관을 붙일 때는 `sources.ts`에 `Source` 하나를 더한다. 그 뒤 파이프라인은 기관과 무관하다.
- SH는 공개 API가 없어 게시판 HTML을 파싱한다. 구조가 바뀌면 깨지므로 파서 변경 시 `collector/test/sh.test.ts`의 실제 HTML 조각을 함께 갱신한다.
- 제품 한 줄: 공고를 찾는 앱이 아니라 "이 공고가 나한테 맞는지 판단하는 앱". 지도·커뮤니티·복지정보는 V0.1에서 만들지 않는다 (`TODO.md`의 제품 포지션).
- 비용 계산은 임대와 분양 둘 다 V0.1이다. 임대는 `engine/cost.ts`, 분양 납부 계획은 `engine/sale.ts`.
  분양 비율은 공고문에서 읽은 payment_schedule만 쓰고 표준 비율을 짐작해 채우지 않는다.
- 아이콘은 `src/components/icon` 배럴 하나로만 들어온다. 두 가족이 있고 섞지 않는다:
  MONO는 한 가지 색(`currentColor`)이라 쓰는 쪽이 색을 정하고, ASSET은 브랜드 색이 박혀 있어 `color`를 무시한다.
  굵기·색 보정 props는 없다 — 도형에 박혀 있다. 고칠 때는 `icons.ts`를 통째로 갈아 끼우고
  `npm run app:icons`로 라이트·다크 양쪽을 본다. 원본에서 손댄 곳은 그 파일 머리말에 적는다.
- 앱 상대 import에 `.js` 확장자를 붙이지 않는다 (Metro가 .ts로 못 푼다).
- 수집기 `insertVersion`은 정규화 테이블과 함께 `announcement_versions.extraction`(jsonb)도 채운다. 앱은 그 jsonb만 읽는다.
- 건강보험료율 등 연도별 상수는 엔진 한 곳(`income.ts`)에 기준일과 함께 둔다.
- 커밋 메시지는 한국어 또는 영어 한 줄 요약 + 필요하면 본문.
