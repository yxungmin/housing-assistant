import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";
import { SERVICE_REGIONS } from "@housing/schema";
import { fromRoot } from "./paths";

// 루트 .env를 읽는다 (Node 20.12+ 내장). GitHub Actions에서는 파일이 없고 Secrets가 env로 들어온다.
// 이미 설정된 환경 변수는 loadEnvFile이 덮어쓰지 않는다.
const envPath = fromRoot(".env");
if (existsSync(envPath)) loadEnvFile(envPath);

const Env = z.object({
  LH_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  KAKAO_REST_API_KEY: z.string().optional(),
  /** 국토교통부 실거래가 (공공데이터포털). LH 키와 같은 계정 키지만 서비스마다 활용신청이 필요하다 */
  MOLIT_API_KEY: z.string().optional(),
  /** 마이홈포털 예비입주자 대기현황 (공공데이터포털) */
  MYHOME_API_KEY: z.string().optional(),
  /**
   * K-apt 관리비 (공공데이터포털, 활용신청 4건: 단지 목록·기본정보·공용관리비·개별사용료).
   * 공공데이터포털 키는 계정당 하나라 MOLIT_API_KEY와 같은 값이다. 비어 있으면 MOLIT_API_KEY를 쓴다.
   */
  KAPT_API_KEY: z.string().optional(),
  /** 서울시 대중교통 환승경로 (공공데이터포털). 통근 시간 계산용 */
  TRANSIT_API_KEY: z.string().optional(),
  /**
   * 추출 모델. 벤치마크로 바꿔가며 비교한다.
   * 기본은 Opus 5.5 (2026-09-24): 단가가 Opus 5보다 싸고($4/$20 vs $5/$25) 시험 추출 2건에서 품질이 같거나 나았다.
   * 전체 벤치마크는 아직 돌리지 않았다 (TODO).
   */
  EXTRACTION_MODEL: z.string().default("claude-opus-5-5"),
  /**
   * LLM 추출 스위치. **기본값은 꺼짐**이다.
   * 돈이 나가는 곳은 추출 한 군데뿐이라(공고 1건 약 1,300원) 켜는 것을 명시적인 행동으로 만든다.
   * 켜려면 .env나 Actions 변수에 EXTRACTION_ENABLED=true. 수집·게시·검수는 꺼진 상태에서도 그대로 돈다.
   */
  EXTRACTION_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true" || v === "1"),
  /**
   * 인스타 대본 문장 다듬기(social/copy.ts). 추출과 같은 이유로 **기본값은 꺼짐**이다 — 켜는 것은 명시적인 행동이어야 한다.
   * 꺼져 있어도 템플릿 대본과 재대조는 그대로 돈다(LLM 없음).
   */
  SOCIAL_COPY_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true" || v === "1"),
  /** 대본 문장용 모델. Opus 5.5 — Opus 5보다 20% 싸다($4/$20 per MTok). thinking을 끌 수 없어 effort로 조절한다 */
  SOCIAL_COPY_MODEL: z.string().default("claude-opus-5-5"),
  /** 수집할 공급기관. 쉼표 구분 (LH, SH) */
  COLLECT_PROVIDERS: z.string().default("LH,SH"),
  /**
   * 수집할 시도 코드. 쉼표 구분, 빈 값이면 전국. 기본은 비용 통제를 위해 서울·경기다.
   * 기본값은 packages/schema의 SERVICE_REGIONS에서 온다 — 앱이 "서울·경기만 제공해요"라고
   * 고지하는 근거가 같은 값이어야 한다. 갈리면 고지해 놓고 다른 지역 공고를 보여 주게 된다.
   */
  COLLECT_REGIONS: z.string().default(SERVICE_REGIONS.join(",")),
  /** 한 번 실행에서 처리할 최대 공고 수 (LLM 비용 상한) */
  MAX_ANNOUNCEMENTS_PER_RUN: z.coerce.number().int().min(1).default(10),
  PDF_BUCKET: z.string().default("announcement-pdfs"),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(): Env {
  // .env의 빈 값(KEY=)은 미설정으로 취급한다
  const cleaned = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = Env.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`환경 변수 오류: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function requireEnv<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === "") throw new Error(`${key} 환경 변수가 필요하다 (.env.example 참고)`);
  return v as NonNullable<Env[K]>;
}
