/**
 * 저장된 추출 결과로 다시 채점한다. API를 부르지 않으므로 비용이 들지 않는다.
 *   npm run benchmark:rescore                     benchmark/output의 모든 모델
 *   npm run benchmark:rescore -- --model claude-sonnet-5
 *
 * 채점 방식을 고쳤을 때 이미 돈을 쓴 결과를 버리지 않기 위해 쓴다.
 * 기준은 fixtures 우선, 없으면 초안(*.draft.json).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ExtractionOutput } from "@housing/schema";
import { buildReport, printReport, scoreCase, type CaseMetrics } from "./benchmark-score";
import { fromRoot } from "./paths";

const FIXTURES = fromRoot("benchmark", "fixtures");
const OUT = fromRoot("benchmark", "output");

const argOf = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const onlyModel = argOf("model");

/** id → 기준 추출 결과 */
function loadReferences(): Map<string, { gold: ExtractionOutput; kind: "fixture" | "draft" }> {
  const refs = new Map<string, { gold: ExtractionOutput; kind: "fixture" | "draft" }>();
  if (existsSync(FIXTURES)) {
    for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"))) {
      const raw = JSON.parse(readFileSync(join(FIXTURES, f), "utf8"));
      const parsed = ExtractionOutput.safeParse(raw.gold);
      if (parsed.success) refs.set(raw.id, { gold: parsed.data, kind: "fixture" });
    }
  }
  for (const f of readdirSync(OUT).filter((f) => f.endsWith(".draft.json"))) {
    const id = f.replace(".draft.json", "");
    if (refs.has(id)) continue;
    const raw = JSON.parse(readFileSync(join(OUT, f), "utf8"));
    const parsed = ExtractionOutput.safeParse(raw.gold);
    if (parsed.success) refs.set(id, { gold: parsed.data, kind: "draft" });
  }
  return refs;
}

interface SavedResult {
  output: unknown;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  error?: string;
}

const refs = loadReferences();
if (refs.size === 0) {
  console.log("기준이 없다. benchmark/fixtures 또는 benchmark/output/*.draft.json 이 필요하다.");
  process.exit(0);
}

// <id>.<model>.json 모으기 (draft·report 제외)
const byModel = new Map<string, { id: string; file: string }[]>();
for (const f of readdirSync(OUT)) {
  if (!f.endsWith(".json") || f.endsWith(".draft.json") || f.startsWith("report.")) continue;
  const m = f.match(/^(\d{3})\.(.+)\.json$/);
  if (!m) continue;
  const [, id, model] = m;
  if (onlyModel && model !== onlyModel) continue;
  if (!byModel.has(model!)) byModel.set(model!, []);
  byModel.get(model!)!.push({ id: id!, file: join(OUT, f) });
}

if (byModel.size === 0) {
  console.log("채점할 결과가 없다. 먼저 npm run benchmark 를 돌린다.");
  process.exit(0);
}

for (const [model, files] of byModel) {
  const metrics: CaseMetrics[] = [];
  let kind: "fixture" | "draft" = "draft";
  for (const { id, file } of files.sort((a, b) => a.id.localeCompare(b.id))) {
    const ref = refs.get(id);
    if (!ref) {
      console.warn(`${model} ${id}: 기준 없음, 건너뜀`);
      continue;
    }
    if (ref.kind === "fixture") kind = "fixture";
    const saved = JSON.parse(readFileSync(file, "utf8")) as SavedResult;
    const parsed = saved.output ? ExtractionOutput.safeParse(saved.output) : null;
    metrics.push(
      scoreCase(id, ref.gold, parsed?.success ? parsed.data : null, {
        // 저장된 결과에는 소요 시간이 없다. 시간 지표는 원 리포트를 본다.
        seconds: 0,
        input_tokens: saved.usage?.input_tokens ?? 0,
        output_tokens: saved.usage?.output_tokens ?? 0,
        error: saved.error ?? (saved.output ? "스키마 불일치" : "추출 실패"),
      }),
    );
  }
  if (metrics.length === 0) continue;
  const report = buildReport(model, kind === "fixture" ? "fixture(사람 검토 정답)" : "draft(기준 모델 추출본)", metrics);
  writeFileSync(join(OUT, `report.${model}.json`), JSON.stringify(report, null, 2));
  printReport(report);
  console.table(
    Object.fromEntries(
      metrics.map((m) => [
        m.id,
        {
          조건: m.error ? "실패" : `${m.correct_rules}/${m.gold_rules}`,
          생성: m.error ? "-" : String(m.hallucinated_rules),
          가격: m.error ? "-" : `${m.correct_prices}/${m.gold_prices}`,
          "주택형명": m.error ? "-" : `${m.unit_name_match}/${m.gold_unit_names}`,
          "트랙 차이": m.error ? "-" : String(m.track_delta),
        },
      ]),
    ),
  );
}
