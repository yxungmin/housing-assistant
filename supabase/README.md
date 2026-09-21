# Supabase 붙이기

처음 한 번만 하면 된다. 30~40분. **비용은 들지 않는다** — 무료 플랜으로 충분하고, 돈이 나가는 LLM 추출은 꺼져 있다.

마이그레이션은 빈 Postgres에서 처음부터 적용·동작까지 확인해 뒀다 (`npm run db:check`, Docker 필요).

---

## 1. 프로젝트 만들기 (5분)

1. https://supabase.com 가입
2. 처음이면 **조직(organization)**을 먼저 만들라고 한다. 전부 기본값 그대로 두면 된다 —
   Name은 아무거나(나중에 변경 가능), Type `Personal`, **Plan은 `Free - $0/month`**. 유료를 고르면 결제수단을 요구한다.
3. 이어서 **New project**
4. 입력값
   - Name: `housing-assistant`
   - Database Password: **길게 만들고 비밀번호 관리자에 저장**한다. 나중에 볼 수 없고, 잃어버리면 재설정해야 한다
   - Region: **Northeast Asia (Seoul)** — 기본값이 보통 미국 동부다. 반드시 바꾼다. 앱 사용자가 한국이다
   - Plan: Free
5. 2~3분 기다리면 준비된다

## 2. 마이그레이션 적용 (5분)

대시보드 왼쪽 **SQL Editor** → **New query**.

`supabase/migrations/` 의 파일을 **번호 순서대로** 하나씩 붙여 넣고 각각 Run.

```
0001_init.sql          테이블·RLS·Storage 버킷
0002_publish_version.sql
0003_app_feed.sql
0004_provider.sql
0005_issue_reports.sql   "이 숫자 이상해요" 신고
0006_auto_publish.sql    자동 게시
```

한 번에 몰아 붙이지 말 것 — 어디서 틀어졌는지 알 수 없다. 각 파일은 `Success. No rows returned`가 나오면 된 것이다.

그다음 `supabase/seed/loan_products.sql` 도 같은 방법으로 Run (전세자금대출 상품 목록).

**확인**: Table Editor에 `announcements`, `announcement_versions`, `issue_reports` … 가 보이고,
SQL Editor에서 `select * from app_announcements;` 가 에러 없이 빈 결과를 주면 성공이다.

## 3. 키 꺼내기 (2분)

**Project Settings → API**

| 화면의 이름 | 넣을 곳 | 성격 |
| --- | --- | --- |
| Project URL | `SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL` | 공개해도 됨 |
| `anon` `public` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 앱에 박힌다. 공개 전제 (RLS가 막는다) |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | **절대 앱·저장소에 넣지 말 것.** RLS를 전부 우회한다 |

`service_role` 키는 수집기(GitHub Actions)와 로컬 `.env`에만 둔다. 저장소가 공개라 코드에 넣으면 그대로 털린다.

## 4. 로컬 `.env` (2분)

저장소 루트에 `.env` (git 제외되어 있다):

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
LH_API_KEY=                      # 공공데이터포털 인증키 (2번 참고)
EXTRACTION_ENABLED=false         # 그대로 둔다. true로 하면 공고 1건당 약 1,300원
```

앱은 따로 `apps/mobile/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
```

**확인**: `npm run review` → http://localhost:4310 → 헤더의 **신고 큐**가 "Supabase 미설정" 대신 빈 목록을 보여 주면 붙은 것이다.

## 5. GitHub Secrets (5분)

저장소 → **Settings → Secrets and variables → Actions**

**Secrets** (New repository secret)

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 |
| `LH_API_KEY` | 공공데이터포털 인증키 |
| `ANTHROPIC_API_KEY` | (추출을 켤 때만 필요) |
| `KAKAO_REST_API_KEY` | (주소 → 좌표. 나중에) |

**Variables** 탭은 지금 손대지 않는다. `EXTRACTION_ENABLED`가 없으면 꺼진 것으로 동작한다.

`.github/workflows/collect.yml` 의 cron은 주석 처리돼 있다. 정기 실행은 추출을 켤 때 함께 푼다.

---

## 붙인 뒤에 달라지는 것

- **신고가 실제로 올라간다.** 지금은 기기에만 쌓인다. 붙는 순간 앱이 밀린 신고를 자동으로 보내고, `npm run review`의 신고 큐에 뜬다
- **앱이 서버 데이터를 본다.** 번들 → 캐시 → 서버 순으로 갈아탄다
- **공고는 아직 안 들어온다.** 수집기가 돌아야 하고, 수집기는 추출이 필요하다 (= 돈). 테스트 기간에는 그대로 꺼 두면 된다

## 추출을 켜기로 하면 (테스트 기간이 끝난 뒤)

1. `LH_API_KEY` 준비 — https://www.data.go.kr 의 "LH 분양임대공고" 활용신청 (자동승인·무료)
2. `.env` 또는 Actions **Variables**에 `EXTRACTION_ENABLED=true`
3. 먼저 손으로 한 번: `npm run collect` — 한 번에 최대 `MAX_ANNOUNCEMENTS_PER_RUN`건(기본 10)만 처리한다. **첫 실행은 5건 이하로 줄여 두고 Anthropic 콘솔에서 실제 청구액을 확인할 것** (TODO의 "모델 단가 실측 확인")
4. 괜찮으면 `collect.yml`의 cron 주석을 푼다

비용은 서울·경기 LH+SH 기준 월 31건 × 약 1,300원 ≈ 41,000원으로 잡고 있다. 단가 실측 전까지는 추정이다.

## 막히면

- **SQL 에러** — 순서대로 돌렸는지 본다. 0004는 0003이, 0006은 0005가 있어야 한다
- **앱이 서버 데이터를 못 받음** — `apps/mobile/.env`는 Expo를 **다시 시작해야** 반영된다 (`EXPO_PUBLIC_` 값은 빌드 타임에 박힌다)
- **신고가 안 올라감** — 앱 로컬 데이터(`"018"` 같은 id)에서 한 신고는 서버 공고 uuid가 아니라 보내지 않는다. 서버에서 받은 공고에서 신고해야 올라간다
- **바꾼 마이그레이션을 다시 적용** — `npm run db:check`로 빈 DB에서 전체를 먼저 돌려 본다
