/**
 * 추출 출력이 어디서 커지는지 잰다. `npm run output:size`
 *
 * 왜 출력이냐 — 2026-09-20 실측에서 Opus 비용의 70%가 출력 토큰이었다(입력 $6.1 / 출력 $12.6).
 * 공고문이 길어서 비싼 게 아니라 추출 결과 JSON이 길어서 비싸다. 줄일 곳은 여기다.
 *
 * 재는 대상은 LLM이 실제로 뱉는 모양(`llm/llmSchema.ts`의 LlmExtraction)이지 저장된 모양이 아니다.
 * 둘은 다르다 — LlmSchema는 모든 필드를 필수로 두고 없는 값을 null로 채우므로 25% 더 크다.
 * 저장된 JSON을 재면 그 25%가 안 보인다.
 *
 * 글자 수로 재고 토큰으로 환산한다. 2026-09-20 실측에서 1토큰 ≈ 1.18자였다
 * (Opus 출력 502,236토큰 ↔ 추출 21건 × 28,144자).
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "./paths";
import type { ExtractionOutput } from "@housing/schema";

/** 2026-09-20 청구 실측에서 나온 비율. 모델·언어가 바뀌면 다시 재야 한다. */
const CHARS_PER_TOKEN = 1.18;
/** LlmAppliesTo·LlmPricing이 요구하는 키 순서 (llmSchema.ts와 같아야 한다) */
const APPLIES = ["household_size", "household_size_min", "household_size_max", "income_type", "marriage"] as const;
/** v4에서 payment_schedule을 뺐다. v3 대비 얼마나 줄었는지 보려고 둘 다 둔다. */
const PRICE = ["unit_type", "tier", "kind", "deposit", "monthly_rent", "sale_price", "conversion", "maintenance_estimate", "source"] as const;
const PRICE_V3 = [...PRICE.slice(0, 7), "payment_schedule", ...PRICE.slice(7)] as const;

const j = (o: unknown) => JSON.stringify(o);
const len = (o: unknown) => j(o).length;

/**
 * 저장된 추출 결과를 LLM이 뱉었을 모양으로 되돌린다 (없는 값 → null).
 * v3는 applies_to 키 5개를 늘 쓰고 payment_schedule을 받았다. v4는 둘 다 뺐다.
 */
function asLlmOutput(e: ExtractionOutput, v3 = false): unknown {
  const priceKeys: readonly string[] = v3 ? PRICE_V3 : PRICE;
  return {
    title: e.title,
    housing_type: e.housing_type,
    address: e.address ?? null,
    schedule: e.schedule,
    notes: e.notes,
    tracks: e.tracks.map((t) => ({
      name: t.name,
      households: t.households ?? null,
      unit_types: t.unit_types.map((u) => ({ name: u.name, exclusive_area_m2: u.exclusive_area_m2 ?? null, households: u.households ?? null })),
      rule_groups: t.rule_groups,
      rules: t.rules.map((r) => ({
        group_id: r.group_id,
        category: r.category,
        applies_to:
          v3 || (r.applies_to && Object.keys(r.applies_to).length > 0)
            ? Object.fromEntries(APPLIES.map((k) => [k, (r.applies_to as Record<string, unknown>)?.[k] ?? null]))
            : null,
        operator: r.operator,
        value_json: j(r.value),
        unit: r.unit ?? null,
        source: r.source,
        confidence: r.confidence,
      })),
      pricing: t.pricing.map((p) => Object.fromEntries(priceKeys.map((k) => [k, (p as Record<string, unknown>)[k] ?? null]))),
    })),
  };
}

const items = JSON.parse(readFileSync(fromRoot("apps", "mobile", "data", "announcements.json"), "utf8")) as { id: string; extraction: ExtractionOutput }[];
const list = items.map((i) => i.extraction).filter((e) => e.tracks.some((t) => t.rules.length > 0 || t.pricing.length > 0));
if (list.length === 0) throw new Error("잴 추출 결과가 없다. 번들 데이터(apps/mobile/data/announcements.json)를 먼저 채워야 한다");

const total = list.reduce((s, e) => s + len(asLlmOutput(e)), 0);
const totalV3 = list.reduce((s, e) => s + len(asLlmOutput(e, true)), 0);
const rules = list.flatMap((e) => e.tracks.flatMap((t) => t.rules));
const prices = list.flatMap((e) => e.tracks.flatMap((t) => t.pricing));

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** 항목: 줄일 수 있는 후보와 그 크기 */
const candidates: [string, number][] = [
  ["source.text (근거 원문 — 줄이면 안 된다)", sum([...rules, ...prices].map((x) => len(x.source.text) + 8))],
  ["pricing의 null 필드", sum(prices.map((p) => sum(PRICE.map((k) => ((p as Record<string, unknown>)[k] ?? null) === null ? k.length + 8 : 0))))],
  ["notes 5번째 이후 (앱은 4개만 보여 준다)", sum(list.map((e) => len(e.notes.slice(4))))],
  [`confidence (${rules.filter((r) => r.confidence >= 0.8).length}/${rules.length}개가 0.8 이상 — 변별력이 없다)`, rules.length * 17],
];

console.log(`추출 결과 ${list.length}건 — LLM 출력 모양 ${total.toLocaleString("ko-KR")}자 (v3였다면 ${totalV3.toLocaleString("ko-KR")}자, ${(((totalV3 - total) / totalV3) * 100).toFixed(0)}% 줄임)`);
console.log(`공고 1건당 ${Math.round(total / list.length).toLocaleString("ko-KR")}자 ≈ 출력 토큰 ${Math.round(total / list.length / CHARS_PER_TOKEN).toLocaleString("ko-KR")}개\n`);
for (const [label, size] of [...candidates].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label.padEnd(44)}${size.toLocaleString("ko-KR").padStart(8)}자  ${((size / total) * 100).toFixed(1).padStart(5)}%`);
}
const cuttable = sum(candidates.slice(1).map(([, n]) => n));
console.log(`\n남은 후보를 더 걷어내면 ${cuttable.toLocaleString("ko-KR")}자 = ${((cuttable / total) * 100).toFixed(0)}% 더 절감`);
console.log("스키마를 고치면 EXTRACTION_PROMPT_VERSION을 올리고 벤치마크를 다시 돌려 정확도를 확인한다.");
