/**
 * M3 벤치마크: benchmark/fixtures/*.json (정답) + benchmark/pdfs/<id>.pdf → 추출 → 지표.
 *   npm run benchmark                 전체
 *   npm run benchmark -- --only 001   특정 케이스
 *   EXTRACTION_MODEL=claude-sonnet-5 npm run benchmark   모델 비교
 *
 * 기준(reference) 두 가지:
 *  - fixtures: 사람이 검토한 정답. 진짜 정확도를 잰다. 기본값.
 *  - drafts(--from-drafts): benchmark/output/*.draft.json(지금은 Opus 추출본)을 기준으로 삼는다.
 *    정답이 아직 없을 때 "모델을 바꾸면 결과가 얼마나 달라지는가"를 재는 용도다.
 *    같은 모델을 다시 돌리면 그 모델의 재현성(잡음 바닥)이 나오고, 다른 모델 점수는 그 바닥과 비교해서 읽어야 한다.
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
import { ExtractionOutput } from "@housing/schema";
import { buildReport, printReport, scoreCase, type CaseMetrics } from "./benchmark-score";
import { loadEnv } from "./config";
import { extractFromText } from "./llm/extract";
import { extractPdfText } from "./pdf/extract";
import { buildSections, sectionsToPrompt } from "./pdf/sections";
import { fromRoot } from "./paths";

const Gold = z.object({
  id: z.string(),
  pdf: z.string().describe("benchmark/pdfs/ 아래 파일명"),
  housing_type_label: z.string().optional(),
  gold: ExtractionOutput,
});

const FIXTURES = fromRoot("benchmark", "fixtures");
const PDFS = fromRoot("benchmark", "pdfs");
const OUT = fromRoot("benchmark", "output");

const argOf = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = argOf("only");
/** 쉼표로 여러 건 지정 (--cases 002,008,018) */
const cases = (argOf("cases") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
const fromDrafts = process.argv.includes("--from-drafts");
const env = loadEnv();

// 기준 파일 모으기: fixtures 우선, --from-drafts면 없는 건 초안으로 채운다
const referenceFiles: { path: string; reference: "fixture" | "draft" }[] = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"))
  .map((f) => ({ path: join(FIXTURES, f), reference: "fixture" as const }));
if (fromDrafts) {
  const haveIds = new Set(referenceFiles.map((r) => JSON.parse(readFileSync(r.path, "utf8")).id));
  for (const f of readdirSync(OUT).filter((f) => f.endsWith(".draft.json"))) {
    const id = f.replace(".draft.json", "");
    if (!haveIds.has(id)) referenceFiles.push({ path: join(OUT, f), reference: "draft" });
  }
}
const metrics: CaseMetrics[] = [];
mkdirSync(OUT, { recursive: true });

for (const { path: refPath, reference } of referenceFiles) {
  const fixture = Gold.parse(JSON.parse(readFileSync(refPath, "utf8")));
  if (only && fixture.id !== only) continue;
  if (cases.length && !cases.includes(fixture.id)) continue;
  void reference;
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

  metrics.push(
    scoreCase(fixture.id, fixture.gold, result.output, {
      seconds,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      error: result.error,
    }),
  );
  const m = metrics[metrics.length - 1]!;
  console.log(
    m.error
      ? `${fixture.id}: 추출 실패 — ${m.error}`
      : `${fixture.id}: 조건 ${m.correct_rules}/${m.gold_rules} (+${m.hallucinated_rules} 생성) 가격 ${m.correct_prices}/${m.gold_prices} 트랙차 ${m.track_delta} ${seconds.toFixed(0)}s`,
  );
}

if (metrics.length === 0) {
  console.log("벤치마크 케이스가 없다. benchmark/README.md를 보고 fixtures와 pdfs를 채운다.");
  process.exit(0);
}
const report = buildReport(env.EXTRACTION_MODEL, fromDrafts ? "draft(기준 모델 추출본)" : "fixture(사람 검토 정답)", metrics);
writeFileSync(join(OUT, `report.${env.EXTRACTION_MODEL}.json`), JSON.stringify(report, null, 2));
printReport(report);
console.log(`저장: ${join(OUT, `report.${env.EXTRACTION_MODEL}.json`)}`);
