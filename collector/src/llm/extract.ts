import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ExtractionOutput } from "@housing/schema";
import { z } from "zod";
import { LlmExtraction, toExtractionOutput } from "./llmSchema";

/**
 * 공고문 텍스트 → ExtractionOutput. AI가 개입하는 유일한 지점.
 * 프롬프트를 바꾸면 벤치마크 30건을 다시 돌려 비교한 뒤 배포한다 (npm run benchmark).
 *
 * 1차: 구조화 출력(output_config.format)으로 스키마를 강제한다.
 * 2차: API가 "문법이 너무 크다"고 거부하면 같은 스키마를 프롬프트에 넣고 JSON 텍스트로 받아 클라이언트에서 검증한다.
 */
export const EXTRACTION_PROMPT_VERSION = "v3";

const SYSTEM_PROMPT = `당신은 LH 공공주택 모집공고문을 구조화하는 추출기입니다. 판단이나 요약을 하지 않고, 공고문에 적힌 조건과 금액을 주어진 스키마에 그대로 옮깁니다.

규칙
- 공급 트랙(우선공급·일반공급·계층별 공급 등)마다 tracks 항목 하나. 트랙마다 자격 룰과 주택형별 가격을 넣습니다.
- 자격 조건은 룰 하나에 조건 하나입니다. 소득 상한이 가구원 수·맞벌이 여부에 따라 다르면 applies_to를 달리해 룰을 여러 개 만듭니다. 소득은 원/월 절대 금액으로 적고 unit은 KRW_monthly, 공고문이 %만 주고 금액표를 주지 않으면 그 룰은 만들지 말고 notes에 원문을 남깁니다.
- "또는"으로 이어진 대안 조건(예: 혼인 7년 이내 또는 6세 이하 자녀)은 같은 group_id에 mode any_of 그룹으로 묶습니다. 그 외는 all_of입니다. 모든 룰의 group_id는 그 트랙의 rule_groups에 있어야 합니다.
- category별 프로필 대응: income(원/월), asset(원), car_value(원), debt(원/월), residence(시도 코드, operator in), housing(무주택 개월, gte 0 = 무주택 요건), marriage(혼인 년수 lte / unit status면 상태 in), children(자녀 수 또는 unit child_age면 자녀 나이), age(만 나이, between), subscription(가입 개월 또는 unit count면 납입 횟수), status(계층 자격).
- 트랙 이름이 특정 계층(대학생, 청년, 신혼부부, 고령자, 주거급여 수급자, 창작자 등)이면 그 계층 자체를 룰로 반드시 넣습니다. 나이·혼인·자녀·소득처럼 숫자·상태로 표현되면 해당 category를 쓰고, 그렇지 않은 자격은 category status, operator in, value_json에 아래 값 배열을 씁니다: student(대학생·입복학 예정), job_seeker(취업준비생), new_worker(사회초년생·소득 업무 5년 이내), artist(예술인), welfare_recipient(주거급여 수급자), basic_livelihood(생계·의료급여 수급자), national_merit(국가유공자), disabled(장애인), nk_defector(북한이탈주민), single_parent_support(한부모가족 지원대상), elderly_care(65세 이상 직계존속 부양), care_leaver(아동복지시설 퇴소자), creator(창작자). 예: 대학생 계층 → "[\\"student\\",\\"job_seeker\\"]". "대안 중 하나"면 같은 any_of 그룹에 나이 룰 등과 함께 둡니다.
- value_json은 값을 JSON 문자열로 적습니다: 숫자 "8640000", between "[19,39]", in "[\\"11\\",\\"41\\"]", is_true "true".
- 모든 룰과 가격에 source.page(=== p.N === 표시의 N)와 source.text(원문 발췌 500자 이내)를 넣습니다.
- 금액은 원 단위 정수입니다 ("6,000만원" → 60000000). 월임대료·보증금은 주택형(unit_type)별로 한 항목씩.
- 같은 주택형인데 계층(대학생/소득있는 청년/고령자 등)에 따라 임대조건이 다르면 pricing 항목을 계층별로 나누고 tier에 계층 이름을 적습니다.
- 전환보증금 조건이 있으면 conversion에 rate(보증금 증액·월세 감액 이율, 소수), rate_down(보증금 감액·월세 증액 이율), max_deposit(최대 증액 시 보증금), min_deposit(최대 감액 시 보증금)을 넣습니다. 표의 "최대전환 시 임대조건"이 상한·하한입니다.
- 없는 값은 null로 둡니다. 공고문에 없는 조건은 만들지 않습니다. 확신이 낮으면 confidence를 낮게 두고 notes에 원문을 남깁니다.
- notes는 앱 사용자에게 "그 밖의 조건"으로 그대로 보입니다. 구조화하지 못한 자격·제한 조건의 공고문 원문 발췌만 넣고, 추출 과정 설명이나 판단 근거("~로 판단함", "스키마에 없어 생성하지 않음", "null로 둠")는 절대 넣지 않습니다.
- 날짜는 YYYY-MM-DD.`;

const JSON_ONLY_SUFFIX = `

출력은 아래 JSON Schema를 만족하는 JSON 객체 하나만, 코드 펜스나 설명 없이 반환합니다.
`;

export interface ExtractionResult {
  output: ExtractionOutput | null;
  model: string;
  prompt_version: string;
  /** grammar = 구조화 출력, json = 프롬프트 스키마 + 클라이언트 검증 */
  mode: "grammar" | "json";
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
  stop_reason: string | null;
  /** 스키마 파싱 실패 등 사유 */
  error?: string;
}

export interface ExtractOptions {
  model: string;
  client?: Anthropic;
  /** 실패 시 1회 재시도 (문서: Schema 검증 실패 시 1회 재시도, 이후 CONFLICT) */
  retries?: number;
  /** 구조화 출력을 건너뛰고 바로 JSON 모드로 */
  forceJsonMode?: boolean;
}

const emptyUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };

function stripFences(text: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (m?.[1] ?? text).trim();
}

export async function extractFromText(noticeText: string, opts: ExtractOptions): Promise<ExtractionResult> {
  const client = opts.client ?? new Anthropic();
  const retries = opts.retries ?? 1;
  let mode: "grammar" | "json" = opts.forceJsonMode ? "json" : "grammar";
  let lastError: string | undefined;
  const schemaText = JSON.stringify(z.toJSONSchema(LlmExtraction, { io: "input" }));

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const system = mode === "grammar" ? SYSTEM_PROMPT : SYSTEM_PROMPT + JSON_ONLY_SUFFIX + schemaText;
      const stream = client.messages.stream({
        model: opts.model,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config:
          mode === "grammar" ? { effort: "high", format: zodOutputFormat(LlmExtraction) } : { effort: "high" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `다음은 모집공고문 본문입니다. 스키마에 맞게 구조화하세요.${attempt > 0 && lastError ? `\n\n이전 시도는 스키마 검증에 실패했습니다: ${lastError}` : ""}\n\n${noticeText}`,
          },
        ],
      });
      const message = await stream.finalMessage();
      const usage = {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
      };
      const base = { model: message.model, prompt_version: EXTRACTION_PROMPT_VERSION, mode, usage };
      if (message.stop_reason === "refusal") {
        return { ...base, output: null, stop_reason: "refusal", error: message.stop_details?.explanation ?? "refusal" };
      }
      if (message.stop_reason === "max_tokens") {
        return { ...base, output: null, stop_reason: "max_tokens", error: "출력이 max_tokens에서 잘림" };
      }
      const text = message.content.find((b) => b.type === "text")?.text ?? "";
      let raw: unknown;
      try {
        raw = JSON.parse(stripFences(text));
      } catch (e) {
        lastError = `JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }
      const llm = LlmExtraction.safeParse(raw);
      if (!llm.success) {
        lastError = llm.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        continue;
      }
      const parsed = toExtractionOutput(llm.data);
      if (!parsed.success) {
        lastError = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        continue;
      }
      return { ...base, output: parsed.data, stop_reason: message.stop_reason };
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && mode === "grammar" && /grammar/i.test(err.message)) {
        // 구조화 출력 문법이 너무 큼 → JSON 모드로 같은 시도 번호에서 다시
        mode = "json";
        attempt--;
        continue;
      }
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
        lastError = `API ${err.status}: ${err.message}`;
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        return { output: null, model: opts.model, prompt_version: EXTRACTION_PROMPT_VERSION, mode, usage: emptyUsage, stop_reason: null, error: `API ${err.status}: ${err.message}` };
      }
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    output: null,
    model: opts.model,
    prompt_version: EXTRACTION_PROMPT_VERSION,
    mode,
    usage: emptyUsage,
    stop_reason: null,
    error: lastError ?? "unknown",
  };
}
