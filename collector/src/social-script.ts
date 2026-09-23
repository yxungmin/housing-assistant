/**
 * 공고 → 인스타 릴스 대본·캡션 JSON. `npm run social:script`
 *
 *   npm run social:script                 지금 공고 전부, 템플릿만 (LLM 없음, 비용 0)
 *   npm run social:script -- --id 012     한 건만
 *   npm run social:script -- --llm        Claude Opus 5.5로 문장 다듬기 (SOCIAL_COPY_ENABLED=true 필요)
 *
 * 흐름: 공고 데이터 → 사실(facts.ts) → 템플릿 대본(script.ts) → [Claude 다듬기(copy.ts)] → 재대조(verify.ts)
 * 결과는 social/output/<id>.<type>.json. 영상(Remotion)과 게시(Instagram)는 이 JSON을 받는 다음 단계다.
 *
 * 다운로드 링크는 앱 출시 후에 SOCIAL_APP_LINK로 넣는다. 없으면 캡션의 링크 문장과 첫 댓글을 만들지 않는다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFacts } from "./social/facts";
import { templateScript, typesFor, type ReelScript } from "./social/script";
import { verifyScript, type Verdict } from "./social/verify";
import { polishScript } from "./social/copy";
import { fromRoot } from "./paths";

const args = process.argv.slice(2);
const only = args.includes("--id") ? args[args.indexOf("--id") + 1] : undefined;
const useLlm = args.includes("--llm");
const appLink = process.env.SOCIAL_APP_LINK || null;
const today = new Date();

const rows = (JSON.parse(readFileSync(fromRoot("apps", "mobile", "data", "announcements.json"), "utf8")) as Parameters<typeof buildFacts>[0][] & { status?: string }[])
  // 조건을 못 읽은 공고로는 대상도 기준도 말할 수 없다
  .filter((r) => (r as { status?: string }).status !== "UNVERIFIED")
  .filter((r) => !only || r.id === only);

const outDir = fromRoot("social", "output");
mkdirSync(outDir, { recursive: true });

let ok = 0;
let rejected = 0;
for (const row of rows) {
  const facts = buildFacts(row);
  // 접수가 끝난 공고는 올리지 않는다
  if (facts.apply.end && facts.apply.end < today.toISOString().slice(0, 10)) continue;
  for (const type of typesFor(facts, today)) {
    const draft = templateScript(facts, type, { appLink, today });
    let script: ReelScript = draft;
    let mode: "template" | "llm" = "template";
    let llmNote: string | undefined;
    if (useLlm) {
      const polished = await polishScript(facts, draft);
      // Claude 문장도 재대조를 통과해야 쓴다. 못 하면 템플릿 대본으로 돌아간다 — 틀린 문장보다 밋밋한 문장이 낫다
      if (polished.script && verifyScript(polished.script, facts, today).ok) {
        script = polished.script;
        mode = "llm";
      } else {
        llmNote = polished.error ?? `재대조 실패: ${verifyScript(polished.script!, facts, today).errors.join(" / ")}`;
      }
    }
    const verdict: Verdict = verifyScript(script, facts, today);
    const file = join(outDir, `${row.id}.${type}.json`);
    writeFileSync(file, JSON.stringify({ id: row.id, type, mode, verdict, script, facts, llm_note: llmNote, generated_at: today.toISOString() }, null, 2));
    if (verdict.ok) ok++;
    else rejected++;
    const mark = verdict.ok ? "OK " : "NG ";
    console.log(`${mark} ${row.id} ${type.padEnd(8)} ${mode.padEnd(8)} ${facts.title.slice(0, 30)}${verdict.errors.length ? `\n      ✗ ${verdict.errors.join("\n      ✗ ")}` : ""}${verdict.warnings.length ? `\n      ! ${verdict.warnings.join("\n      ! ")}` : ""}${llmNote ? `\n      (Claude 결과 버림: ${llmNote})` : ""}`);
  }
}
console.log(`\n${ok}편 통과, ${rejected}편 보류 → ${outDir}`);
if (rejected > 0) process.exitCode = 1;
