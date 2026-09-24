/**
 * 벤치마크 채점. 추출 호출과 분리해 두어 저장된 결과로 다시 채점할 수 있다 (benchmark-rescore.ts).
 *
 * 트랙 이름은 키에 넣지 않는다.
 * 같은 공고라도 모델마다 트랙 이름을 다르게 쓴다("영구임대주택 입주자격완화 예비입주자(일반)" vs
 * "영구임대주택 예비입주자(입주자격완화) 모집"). 이름을 키에 넣으면 내용이 같아도 전부 불일치로 집계된다.
 * 실제로 Opus를 같은 공고에 다시 돌렸을 때 이름이 겹친 공고는 98% 일치, 이름이 달라진 공고는 0%가 나왔다.
 * 그래서 조건은 공고 전체에서 (그룹 모드·카테고리·적용대상·연산자·값)의 집합으로 비교하고,
 * 트랙 구조는 track_delta로 따로 본다.
 */
import type { EligibilityRule, ExtractionOutput, Pricing, SupplyTrack } from "@housing/schema";

/**
 * 100만 토큰당 USD. 2026-09-21 실제 청구액으로 확인했다 —
 * 9/20 사용량(Opus 1.27M/0.50M, Sonnet 0.29M/0.14M, Haiku 0.51M/0.10M)의 청구액이 $21.62였고
 * 이 표로 계산하면 $22.58이다. 차이 4%는 캐시 토큰 배수(쓰기 1.25× · 읽기 0.1×) 가정 때문이고,
 * 한때 의심했던 $15/$75였다면 $67.74가 나왔어야 한다. 이 표가 맞다.
 */
// USD / 백만 토큰. platform.claude.com/docs/en/about-claude/pricing (2026-09-24 확인).
// Sonnet 5는 출시 때 $2/$10이 9/1부터 $3/$15로 오른다고 했다가 인상이 취소돼 $2/$10이 정가가 됐다.
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export const priceFor = (model: string) => MODEL_PRICES[model] ?? MODEL_PRICES["claude-opus-5"]!;

function ruleKey(track: SupplyTrack, r: EligibilityRule): string {
  const mode = track.rule_groups.find((g) => g.id === r.group_id)?.mode ?? "all_of";
  const applies = JSON.stringify(Object.fromEntries(Object.entries(r.applies_to ?? {}).sort()));
  return `${mode}|${r.category}|${applies}|${r.operator}|${JSON.stringify(r.value)}`;
}

/** 공고 전체의 조건 집합 (트랙 이름 무관) */
export function ruleKeys(x: ExtractionOutput): Set<string> {
  const s = new Set<string>();
  for (const t of x.tracks) for (const r of t.rules) s.add(ruleKey(t, r));
  return s;
}

/**
 * 가격 행은 금액으로 비교한다. 주택형 이름은 모델마다 표기가 다르다
 * ("H1 17A" vs "17A"). 금액이 똑같아도 이름 때문에 전부 불일치로 집계되던 문제를 피한다.
 * 같은 (계층, 보증금, 월세, 분양가) 행이 여러 번 나오면 나온 횟수까지 센다.
 */
const priceRow = (p: Pricing) => `${p.tier ?? ""}|${p.deposit ?? ""}|${p.monthly_rent ?? ""}|${p.sale_price ?? ""}`;

export function priceRows(x: ExtractionOutput): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of x.tracks) for (const p of t.pricing) m.set(priceRow(p), (m.get(priceRow(p)) ?? 0) + 1);
  return m;
}

/** 주택형 이름 자체가 얼마나 겹치는가 (참고 지표) */
export function unitNames(x: ExtractionOutput): Set<string> {
  const s = new Set<string>();
  for (const t of x.tracks) for (const p of t.pricing) s.add(p.unit_type);
  return s;
}

export interface CaseMetrics {
  id: string;
  gold_rules: number;
  correct_rules: number;
  missing_rules: number;
  hallucinated_rules: number;
  gold_prices: number;
  correct_prices: number;
  all_rules_correct: boolean;
  /** 트랙 수 차이 (추출 − 기준). 이름은 비교하지 않고 개수만 본다. */
  track_delta: number;
  /** 주택형 이름이 그대로 겹친 수 (참고) */
  unit_name_match: number;
  gold_unit_names: number;
  seconds: number;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

export function scoreCase(
  id: string,
  gold: ExtractionOutput,
  got: ExtractionOutput | null,
  meta: { seconds: number; input_tokens: number; output_tokens: number; error?: string },
): CaseMetrics {
  const goldRules = ruleKeys(gold);
  const goldPrices = priceRows(gold);
  const goldNames = unitNames(gold);
  const goldPriceCount = [...goldPrices.values()].reduce((a, b) => a + b, 0);
  const base: CaseMetrics = {
    id,
    gold_rules: goldRules.size,
    correct_rules: 0,
    missing_rules: goldRules.size,
    hallucinated_rules: 0,
    gold_prices: goldPriceCount,
    correct_prices: 0,
    all_rules_correct: false,
    track_delta: 0,
    unit_name_match: 0,
    gold_unit_names: goldNames.size,
    seconds: meta.seconds,
    input_tokens: meta.input_tokens,
    output_tokens: meta.output_tokens,
  };
  if (!got) return { ...base, error: meta.error ?? "추출 결과 없음" };

  const gotRules = ruleKeys(got);
  const gotPrices = priceRows(got);
  const gotNames = unitNames(got);
  const correct = [...goldRules].filter((k) => gotRules.has(k)).length;
  const hallucinated = [...gotRules].filter((k) => !goldRules.has(k)).length;
  // 같은 가격 행이 여러 번 나오면 적게 나온 쪽만큼만 맞은 것으로 센다
  const correctPrices = [...goldPrices].reduce((a, [k, n]) => a + Math.min(n, gotPrices.get(k) ?? 0), 0);
  return {
    ...base,
    correct_rules: correct,
    missing_rules: goldRules.size - correct,
    hallucinated_rules: hallucinated,
    correct_prices: correctPrices,
    all_rules_correct: correct === goldRules.size && hallucinated === 0,
    track_delta: got.tracks.length - gold.tracks.length,
    unit_name_match: [...goldNames].filter((n) => gotNames.has(n)).length,
  };
}

export interface Report {
  model: string;
  reference: string;
  cases: number;
  failed_cases: number;
  rule_accuracy: number;
  announcement_exact_rate: number;
  price_accuracy: number;
  missing_rate: number;
  hallucination_rate: number;
  /** 주택형 이름까지 그대로 같은 비율 (참고) */
  unit_name_rate: number;
  avg_seconds: number;
  avg_cost_usd: number;
  targets: Record<string, number>;
  cases_detail: CaseMetrics[];
}

export function buildReport(model: string, reference: string, metrics: CaseMetrics[]): Report {
  const sum = (f: (m: CaseMetrics) => number) => metrics.reduce((a, m) => a + f(m), 0);
  const goldRules = Math.max(1, sum((m) => m.gold_rules));
  const gotRules = sum((m) => m.correct_rules + m.hallucinated_rules);
  const price = priceFor(model);
  return {
    model,
    reference,
    cases: metrics.length,
    failed_cases: metrics.filter((m) => m.error).length,
    rule_accuracy: sum((m) => m.correct_rules) / goldRules,
    announcement_exact_rate: metrics.filter((m) => m.all_rules_correct).length / Math.max(1, metrics.length),
    price_accuracy: sum((m) => m.correct_prices) / Math.max(1, sum((m) => m.gold_prices)),
    missing_rate: sum((m) => m.missing_rules) / goldRules,
    hallucination_rate: gotRules ? sum((m) => m.hallucinated_rules) / gotRules : 0,
    unit_name_rate: sum((m) => m.unit_name_match) / Math.max(1, sum((m) => m.gold_unit_names)),
    avg_seconds: sum((m) => m.seconds) / Math.max(1, metrics.length),
    avg_cost_usd: (sum((m) => m.input_tokens) * price.input + sum((m) => m.output_tokens) * price.output) / 1_000_000 / Math.max(1, metrics.length),
    targets: { rule_accuracy: 0.95, announcement_exact_rate: 0.8, price_accuracy: 0.98, missing_rate: 0.03, hallucination_rate: 0.01, avg_seconds: 300 },
    cases_detail: metrics,
  };
}

export function printReport(report: Report): void {
  console.log("\n=== 벤치마크 결과 ===");
  console.log(`모델 ${report.model} · 기준 ${report.reference} · 케이스 ${report.cases}건 (실패 ${report.failed_cases}건)\n`);
  console.table({
    "조건 일치율": `${(report.rule_accuracy * 100).toFixed(1)}% (목표 95%)`,
    "공고 단위 완전 일치율": `${(report.announcement_exact_rate * 100).toFixed(1)}% (목표 80%)`,
    "가격 금액 일치율": `${(report.price_accuracy * 100).toFixed(1)}% (목표 98%)`,
    "주택형 이름 일치율": `${(report.unit_name_rate * 100).toFixed(1)}% (참고)`,
    누락률: `${(report.missing_rate * 100).toFixed(1)}% (목표 ≤3%)`,
    "없는 조건 생성률": `${(report.hallucination_rate * 100).toFixed(1)}% (목표 ≤1%)`,
    "공고 1건 시간": `${report.avg_seconds.toFixed(0)}s (목표 ≤300s)`,
    "공고 1건 비용": `$${report.avg_cost_usd.toFixed(3)} (약 ${Math.round(report.avg_cost_usd * 1400).toLocaleString("ko-KR")}원)`,
  });
}
