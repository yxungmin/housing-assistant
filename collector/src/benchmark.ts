/**
 * M3 벤치마크: benchmark/fixtures/*.json (정답) + benchmark/pdfs/<id>.pdf → 추출 → 지표.
 *   npm run benchmark                 전체
 *   npm run benchmark -- --only 001   특정 케이스
 *   EXTRACTION_MODEL=claude-sonnet-5 npm run benchmark   모델 비교
 *
 * 지표 (문서 "품질 기준과 검증"):
 *  - 룰 단위 정확 추출률: category·applies_to·operator·value·그룹 mode가 모두 일치한 정답 룰 비율
 *  - 공고 단위 완전 일치율: 모든 정답 룰이 정확한 공고 비율
 *  - 가격표 정확 추출률: 주택형별 (deposit, monthly_rent, sale_price) 셀 일치 비율
 *  - 누락률: 정답에 있지만 추출되지 않은 룰 비율
 *  - 없는 조건 생성률: 정답에 없는데 추출된 룰 비율
 *  - 공고 1건 비용·시간
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ExtractionOutput, type EligibilityRule, type SupplyTrack } from "@housing/schema";
import { loadEnv } from "./config.js";
import { extractFromText } from "./llm/extract.js";
import { extractPdfText } from "./pdf/extract.js";
import { buildSections, sectionsToPrompt } from "./pdf/sections.js";
import { fromRoot } from "./paths.js";

const Gold = z.object({
  id: z.string(),
  pdf: z.string().describe("benchmark/pdfs/ 아래 파일명"),
  housing_type_label: z.string().optional(),
  gold: ExtractionOutput,
});

const FIXTURES = fromRoot("benchmark", "fixtures");
const PDFS = fromRoot("benchmark", "pdfs");
const OUT = fromRoot("benchmark", "output");

const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;
const env = loadEnv();

function ruleKey(track: SupplyTrack, r: EligibilityRule): string {
  const mode = track.rule_groups.find((g) => g.id === r.group_id)?.mode ?? "all_of";
  const applies = JSON.stringify(Object.fromEntries(Object.entries(r.applies_to ?? {}).sort()));
  return `${track.name}|${mode}|${r.category}|${applies}|${r.operator}|${JSON.stringify(r.value)}`;
}

function ruleKeys(x: ExtractionOutput): Set<string> {
  const s = new Set<string>();
  for (const t of x.tracks) for (const r of t.rules) s.add(ruleKey(t, r));
  return s;
}

function priceCells(x: ExtractionOutput): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of x.tracks) for (const p of t.pricing) m.set(`${t.name}|${p.unit_type}|${p.tier ?? ""}`, `${p.deposit ?? ""}|${p.monthly_rent ?? ""}|${p.sale_price ?? ""}`);
  return m;
}

interface CaseMetrics {
  id: string;
  gold_rules: number;
  correct_rules: number;
  missing_rules: number;
  hallucinated_rules: number;
  gold_prices: number;
  correct_prices: number;
  all_rules_correct: boolean;
  seconds: number;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

// 가격은 모델 카드 기준 대략치 (Opus 5: $5 / $25 per 1M). 모델을 바꾸면 여기 값도 바꾼다.
const PRICE_PER_M = { input: 5, output: 25 };

const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"));
const metrics: CaseMetrics[] = [];
mkdirSync(OUT, { recursive: true });

for (const file of files) {
  const fixture = Gold.parse(JSON.parse(readFileSync(join(FIXTURES, file), "utf8")));
  if (only && fixture.id !== only) continue;
  const pdfPath = join(PDFS, fixture.pdf);
  if (!existsSync(pdfPath)) {
    console.warn(`skip ${fixture.id}: ${pdfPath} 없음`);
    continue;
  }
  const started = Date.now();
  const bytes = new Uint8Array(readFileSync(pdfPath));
  const text = await extractPdfText(bytes);
  const prompt = sectionsToPrompt(buildSections(text.pages));
  const result = await extractFromText(prompt, { model: env.EXTRACTION_MODEL });
  const seconds = (Date.now() - started) / 1000;
  writeFileSync(join(OUT, `${fixture.id}.${env.EXTRACTION_MODEL}.json`), JSON.stringify(result, null, 2));

  const goldRules = ruleKeys(fixture.gold);
  const goldPrices = priceCells(fixture.gold);
  const base: CaseMetrics = {
    id: fixture.id,
    gold_rules: goldRules.size,
    correct_rules: 0,
    missing_rules: goldRules.size,
    hallucinated_rules: 0,
    gold_prices: goldPrices.size,
    correct_prices: 0,
    all_rules_correct: false,
    seconds,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
  };
  if (!result.output) {
    metrics.push({ ...base, error: result.error });
    console.log(`${fixture.id}: 추출 실패 — ${result.error}`);
    continue;
  }
  const gotRules = ruleKeys(result.output);
  const gotPrices = priceCells(result.output);
  const correct = [...goldRules].filter((k) => gotRules.has(k)).length;
  const hallucinated = [...gotRules].filter((k) => !goldRules.has(k)).length;
  const correctPrices = [...goldPrices].filter(([k, v]) => gotPrices.get(k) === v).length;
  metrics.push({
    ...base,
    correct_rules: correct,
    missing_rules: goldRules.size - correct,
    hallucinated_rules: hallucinated,
    correct_prices: correctPrices,
    all_rules_correct: correct === goldRules.size && hallucinated === 0,
  });
  console.log(`${fixture.id}: 룰 ${correct}/${goldRules.size} (+${hallucinated} 생성) 가격 ${correctPrices}/${goldPrices.size} ${seconds.toFixed(0)}s`);
}

if (metrics.length === 0) {
  console.log("벤치마크 케이스가 없다. benchmark/README.md를 보고 fixtures와 pdfs를 채운다.");
  process.exit(0);
}
const sum = (f: (m: CaseMetrics) => number) => metrics.reduce((a, m) => a + f(m), 0);
const goldRules = sum((m) => m.gold_rules);
const gotRules = sum((m) => m.correct_rules + m.hallucinated_rules);
const report = {
  model: env.EXTRACTION_MODEL,
  cases: metrics.length,
  rule_accuracy: sum((m) => m.correct_rules) / goldRules,
  announcement_exact_rate: metrics.filter((m) => m.all_rules_correct).length / metrics.length,
  price_accuracy: sum((m) => m.correct_prices) / Math.max(1, sum((m) => m.gold_prices)),
  missing_rate: sum((m) => m.missing_rules) / goldRules,
  hallucination_rate: gotRules ? sum((m) => m.hallucinated_rules) / gotRules : 0,
  avg_seconds: sum((m) => m.seconds) / metrics.length,
  avg_cost_usd: (sum((m) => m.input_tokens) * PRICE_PER_M.input + sum((m) => m.output_tokens) * PRICE_PER_M.output) / 1_000_000 / metrics.length,
  targets: { rule_accuracy: 0.95, announcement_exact_rate: 0.8, price_accuracy: 0.98, missing_rate: 0.03, hallucination_rate: 0.01, avg_seconds: 300 },
  cases_detail: metrics,
};
writeFileSync(join(OUT, `report.${env.EXTRACTION_MODEL}.json`), JSON.stringify(report, null, 2));
console.log("\n=== 벤치마크 결과 ===");
console.table({
  "룰 단위 정확 추출률": `${(report.rule_accuracy * 100).toFixed(1)}% (목표 95%)`,
  "공고 단위 완전 일치율": `${(report.announcement_exact_rate * 100).toFixed(1)}% (목표 80%)`,
  "가격표 정확 추출률": `${(report.price_accuracy * 100).toFixed(1)}% (목표 98%)`,
  누락률: `${(report.missing_rate * 100).toFixed(1)}% (목표 ≤3%)`,
  "없는 조건 생성률": `${(report.hallucination_rate * 100).toFixed(1)}% (목표 ≤1%)`,
  "공고 1건 시간": `${report.avg_seconds.toFixed(0)}s (목표 ≤300s)`,
  "공고 1건 비용": `$${report.avg_cost_usd.toFixed(3)}`,
});
