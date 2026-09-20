import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";
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
  /** 추출 모델. 벤치마크로 바꿔가며 비교한다. */
  EXTRACTION_MODEL: z.string().default("claude-opus-5"),
  /** 수집할 공급기관. 쉼표 구분 (LH, SH) */
  COLLECT_PROVIDERS: z.string().default("LH,SH"),
  /** 수집할 시도 코드. 쉼표 구분, 빈 값이면 전국. 기본은 서울·경기 (비용 통제) */
  COLLECT_REGIONS: z.string().default("11,41"),
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
