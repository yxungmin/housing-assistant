/**
 * PDF 파이프라인 점검 도구 (M1·M2용). LLM은 --extract를 붙일 때만 호출한다.
 *   npm run inspect -- benchmark/pdfs/001.pdf            텍스트·섹션 통계, 섹션별 앞부분 출력
 *   npm run inspect -- benchmark/pdfs/001.pdf --text     전체 텍스트를 benchmark/output/<name>.txt로 저장
 *   npm run inspect -- benchmark/pdfs/001.pdf --extract  LLM 추출 → benchmark/output/<name>.draft.json
 *                                                        (정답 fixture 초안. 사람이 고쳐서 fixtures/<id>.json으로)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadEnv } from "./config.js";
import { extractPdfText } from "./pdf/extract.js";
import { buildSections, sectionsToPrompt } from "./pdf/sections.js";
import { autoChecks } from "./validate/autoChecks.js";
import { fromRoot, fromUser } from "./paths.js";

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith("--"));
const file = fileArg ? fromUser(fileArg) : undefined;
if (!file || !existsSync(file)) {
  console.error("사용법: npm run inspect -- <pdf 경로> [--text] [--extract]");
  process.exit(1);
}
const name = basename(file, ".pdf");
const outDir = fromRoot("benchmark", "output");
mkdirSync(outDir, { recursive: true });

const bytes = new Uint8Array(readFileSync(file));
const sizeKb = (bytes.length / 1024).toFixed(0);
const started = Date.now();
const text = await extractPdfText(bytes);
const sections = buildSections(text.pages);
const prompt = sectionsToPrompt(sections);
const chars = text.pages.reduce((a, p) => a + p.text.length, 0);

console.log(`파일: ${file} (${sizeKb} KB)`);
console.log(`페이지: ${text.pages.length}, 텍스트 ${chars.toLocaleString()}자, 빈 페이지 ${text.emptyPages}, 스캔 의심: ${text.needsOcr ? "예 → OCR 필요" : "아니오"}`);
console.log(`텍스트 추출 ${((Date.now() - started) / 1000).toFixed(1)}s, LLM 입력 ${prompt.length.toLocaleString()}자 (한글 기준 대략 ${Math.round(prompt.length / 1.5).toLocaleString()} 토큰)`);
console.log("\n섹션:");
for (const s of sections) {
  console.log(`  ${s.kind.padEnd(11)} pages ${s.pages.join(",")}  ${s.text.length.toLocaleString()}자`);
}
for (const s of sections.filter((x) => x.kind !== "other")) {
  console.log(`\n--- ${s.kind} 앞부분 ---\n${s.text.slice(0, 500).replace(/\n{2,}/g, "\n")}`);
}

if (args.includes("--text")) {
  const path = join(outDir, `${name}.txt`);
  writeFileSync(path, text.pages.map((p) => `=== p.${p.page} ===\n${p.text}`).join("\n\n"));
  console.log(`\n전체 텍스트 저장: ${path}`);
}

if (args.includes("--extract")) {
  const { extractFromText } = await import("./llm/extract.js");
  const env = loadEnv();
  console.log(`\nLLM 추출 중 (${env.EXTRACTION_MODEL})...`);
  const t0 = Date.now();
  const result = await extractFromText(prompt, { model: env.EXTRACTION_MODEL });
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s, in=${result.usage.input_tokens} out=${result.usage.output_tokens}`);
  if (!result.output) {
    console.error(`  실패: ${result.error}`);
    process.exit(1);
  }
  const issues = autoChecks(result.output);
  const draft = { id: name, pdf: basename(file), housing_type_label: "", gold: result.output, _auto_check_issues: issues, _model: result.model };
  const path = join(outDir, `${name}.draft.json`);
  writeFileSync(path, JSON.stringify(draft, null, 2));
  console.log(`  트랙 ${result.output.tracks.length}개, 룰 ${result.output.tracks.reduce((a, t) => a + t.rules.length, 0)}개, 가격 ${result.output.tracks.reduce((a, t) => a + t.pricing.length, 0)}건`);
  console.log(`  자동 검증: ${issues.length ? issues.join(" / ") : "통과"}`);
  console.log(`  초안 저장: ${path} → 사람이 검토·수정 후 benchmark/fixtures/${name}.json으로 옮긴다`);
}
