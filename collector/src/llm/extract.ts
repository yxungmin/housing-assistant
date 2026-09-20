import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractionOutput } from "@housing/schema";

/**
 * 공고문 텍스트 → ExtractionOutput. AI가 개입하는 유일한 지점.
 * 프롬프트를 바꾸면 벤치마크 30건을 다시 돌려 비교한 뒤 배포한다 (npm run benchmark).
 */
export const EXTRACTION_PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `당신은 LH 공공주택 모집공고문을 구조화하는 추출기입니다. 판단이나 요약을 하지 않고, 공고문에 적힌 조건과 금액을 주어진 스키마에 그대로 옮깁니다.

규칙
- 공급 트랙(우선공급·일반공급·계층별 공급 등)마다 tracks 항목 하나. 트랙마다 자격 룰과 주택형별 가격을 넣습니다.
- 자격 조건은 룰 하나에 조건 하나입니다. 소득 상한이 가구원 수·맞벌이 여부에 따라 다르면 applies_to를 달리해 룰을 여러 개 만듭니다. 소득은 원/월 절대 금액으로 적고 unit은 KRW_monthly, 공고문이 %만 주고 금액표를 주지 않으면 그 룰은 만들지 말고 notes에 원문을 남깁니다.
- "또는"으로 이어진 대안 조건(예: 혼인 7년 이내 또는 6세 이하 자녀)은 같은 group_id에 mode any_of 그룹으로 묶습니다. 그 외는 all_of입니다.
- category별 프로필 대응: income(원/월), asset(원), car_value(원), debt(원/월), residence(시도 코드, operator in), housing(무주택 개월, gte 0 = 무주택 요건), marriage(혼인 년수 lte / unit status면 상태 in), children(자녀 수 또는 unit child_age면 자녀 나이), age(만 나이, between), subscription(가입 개월 또는 unit count면 납입 횟수).
- 모든 룰과 가격에 source.page(=== p.N === 표시의 N)와 source.text(원문 발췌 500자 이내)를 넣습니다.
- 금액은 원 단위 정수입니다 ("6,000만원" → 60000000). 월임대료·보증금은 주택형(unit_type)별로 한 항목씩.
- 같은 주택형인데 계층(대학생/소득있는 청년/고령자 등)에 따라 임대조건이 다르면 pricing 항목을 계층별로 나누고 tier에 계층 이름을 적습니다.
- 전환보증금 조건이 있으면 conversion에 rate(보증금 증액·월세 감액 이율, 소수), rate_down(보증금 감액·월세 증액 이율), max_deposit(최대 증액 시 보증금), min_deposit(최대 감액 시 보증금)을 넣습니다. 표의 "최대전환 시 임대조건"이 상한·하한입니다.
- 공고문에 없는 조건은 만들지 않습니다. 확신이 낮으면 confidence를 낮게 두고 notes에 원문을 남깁니다.
- 날짜는 YYYY-MM-DD.`;

export interface ExtractionResult {
  output: ExtractionOutput | null;
  model: string;
  prompt_version: string;
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
}

export async function extractFromText(noticeText: string, opts: ExtractOptions): Promise<ExtractionResult> {
  const client = opts.client ?? new Anthropic();
  const retries = opts.retries ?? 1;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stream = client.messages.stream({
        model: opts.model,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: zodOutputFormat(ExtractionOutput) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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
      if (message.stop_reason === "refusal") {
        return { output: null, model: message.model, prompt_version: EXTRACTION_PROMPT_VERSION, usage, stop_reason: "refusal", error: message.stop_details?.explanation ?? "refusal" };
      }
      const text = message.content.find((b) => b.type === "text")?.text ?? "";
      const parsed = ExtractionOutput.safeParse(JSON.parse(text));
      if (!parsed.success) {
        lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        continue;
      }
      return { output: parsed.data, model: message.model, prompt_version: EXTRACTION_PROMPT_VERSION, usage, stop_reason: message.stop_reason };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
        lastError = `API ${err.status}: ${err.message}`;
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        return { output: null, model: opts.model, prompt_version: EXTRACTION_PROMPT_VERSION, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }, stop_reason: null, error: `API ${err.status}: ${err.message}` };
      }
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    output: null,
    model: opts.model,
    prompt_version: EXTRACTION_PROMPT_VERSION,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    stop_reason: null,
    error: lastError ?? "unknown",
  };
}
