/**
 * 템플릿 대본의 문장만 Claude가 다듬는다. **기본값은 꺼짐** (SOCIAL_COPY_ENABLED).
 *
 * 맡기는 일은 좁다 — 같은 사실로 더 자연스러운 문장. 장면 구성과 시간은 템플릿 것을 그대로 쓰고,
 * 숫자·날짜·대상을 새로 만들 수 없게 사실 JSON만 준다. 그래도 틀릴 수 있으므로 결과는 verify.ts가
 * 사실과 다시 대조하고, 통과하지 못하면 버리고 템플릿 대본을 쓴다.
 *
 * 모델은 Claude Opus 5.5 (claude-opus-5-5). thinking을 끌 수 없는 모델이라 effort로만 조절한다 —
 * 기본값이 medium이지만 명시해 둔다. 짧은 카피라 그 이상은 필요 없다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { loadEnv } from "../config";
import type { SocialFacts } from "./facts";
import type { ReelScript } from "./script";

export const COPY_PROMPT_VERSION = "v1";

/** 모델이 돌려주는 것. 시간(at)과 종류(type)는 템플릿 것을 쓰므로 받지 않는다 */
const LlmCopy = z.object({
  scenes: z.array(z.object({ kind: z.enum(["hook", "price", "who", "split", "cta"]), lines: z.array(z.string()).min(1).max(4) })),
  caption: z.string(),
  hashtags: z.array(z.string()).max(8),
});

const SYSTEM = `당신은 공공주택 공고 알림 계정의 카피라이터입니다. 주어진 사실 JSON과 템플릿 대본을 받아, 같은 장면 구성으로 문장만 더 자연스럽게 다듬습니다.

지켜야 할 것
- 사실 JSON에 없는 숫자·날짜·지역·대상·공급 유형을 쓰지 않습니다. 숫자와 날짜는 템플릿에 있는 그대로 옮깁니다.
- 장면 순서와 종류(kind)는 템플릿과 같게 둡니다. 화면 한 줄은 18자 이내입니다.
- 공고 사실은 충분히 말하고, 개인별 판단("내가 되는지")만 앱으로 넘깁니다. 정보를 일부러 숨겨 궁금하게 만들지 않습니다.
- "신청 가능", "자격 충족", "당첨 보장", "누구나", "100%" 같은 단정 표현을 쓰지 않습니다. 대상은 "○○도 신청 대상"처럼 씁니다.
- 앞 장면들은 공고 사실(금액·기준·일정)만 말합니다. 앱 이야기는 마지막 cta 장면에만 둡니다 — 광고처럼 들리면 안 됩니다.
- 캡션의 고지 문장("공고 조건은 가구 상황에 따라 달라질 수 있어요")은 반드시 남깁니다.
- 해요체로, 광고처럼 들뜨지 않게 씁니다. 이모지는 쓰지 않습니다.`;

export interface CopyResult {
  script: ReelScript | null;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
  error?: string;
}

function assertEnabled(client?: Anthropic): void {
  if (client) return; // 테스트가 넣어 준 가짜 클라이언트는 과금되지 않는다
  if (loadEnv().SOCIAL_COPY_ENABLED) return;
  throw new Error("대본 문장 다듬기가 꺼져 있다 (SOCIAL_COPY_ENABLED=false). 켜려면 .env에 SOCIAL_COPY_ENABLED=true — 템플릿 대본은 꺼진 상태에서도 나온다.");
}

export async function polishScript(facts: SocialFacts, draft: ReelScript, opts: { client?: Anthropic; model?: string } = {}): Promise<CopyResult> {
  assertEnabled(opts.client);
  const model = opts.model ?? loadEnv().SOCIAL_COPY_MODEL;
  const client = opts.client ?? new Anthropic();
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 16000,
      // Opus 5.5는 thinking을 끌 수 없다(끄면 400). 생략하면 adaptive로 돈다 — 깊이는 effort로만
      output_config: { effort: "medium", format: zodOutputFormat(LlmCopy) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `사실 JSON:\n${JSON.stringify(facts, null, 1)}\n\n템플릿 대본 (${draft.type}):\n${JSON.stringify({ scenes: draft.scenes.map(({ kind, lines }) => ({ kind, lines })), caption: draft.caption, hashtags: draft.hashtags }, null, 1)}`,
        },
      ],
    });
    const usage = { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens };
    // 안전 분류기가 거절하면 본문이 없다. 템플릿 대본으로 돌아간다
    if (message.stop_reason === "refusal") return { script: null, model, usage, error: `refusal: ${message.stop_details?.category ?? ""}` };
    if (message.stop_reason === "max_tokens") return { script: null, model, usage, error: "출력이 max_tokens에서 잘림" };
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = LlmCopy.safeParse(JSON.parse(text));
    if (!parsed.success) return { script: null, model, usage, error: `스키마 불일치: ${parsed.error.issues[0]?.message}` };
    // 장면 구성이 템플릿과 다르면 버린다 — 시간표를 붙일 수 없다
    const kinds = parsed.data.scenes.map((s) => s.kind).join(",");
    if (kinds !== draft.scenes.map((s) => s.kind).join(",")) return { script: null, model, usage, error: `장면 구성이 바뀜: ${kinds}` };
    return {
      script: {
        ...draft,
        scenes: draft.scenes.map((s, i) => ({ ...s, lines: parsed.data.scenes[i]!.lines })),
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags,
      },
      model,
      usage,
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) return { script: null, model, error: `API ${err.status}: ${err.message}` };
    if (err instanceof SyntaxError) return { script: null, model, error: `JSON 파싱 실패: ${err.message}` };
    throw err;
  }
}
