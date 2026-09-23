/**
 * 직접 올린 게시물을 표시한다. `npm run social:posted -- 012.new [014.caution …]`
 *
 * 표시한 초안이 "올린 게시물"이 되고, 이후 social:script는 그 공고·종류의 대본을 다시 만들지 않는다.
 * 공고가 정정되면 이 기록과 비교해 고정 댓글 문안을 만든다. 게시 자동화(Graph API)가 붙으면 게시 단계가 대신 기록한다.
 * 재대조를 통과하지 못한 초안은 표시할 수 없다 — 그런 걸 올렸다면 먼저 내려야 한다.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./paths";

const names = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (names.length === 0) {
  console.error("사용법: npm run social:posted -- <id>.<type> (예: 012.new)");
  process.exit(1);
}
const outDir = fromRoot("social", "output");
const postedDir = fromRoot("social", "posted");
mkdirSync(postedDir, { recursive: true });
for (const name of names) {
  const src = join(outDir, `${name}.json`);
  if (!existsSync(src)) {
    console.error(`초안이 없다: ${src}`);
    process.exitCode = 1;
    continue;
  }
  const draft = JSON.parse(readFileSync(src, "utf8"));
  if (!draft.verdict?.ok) {
    console.error(`${name}: 재대조를 통과하지 못한 초안은 표시하지 않는다`);
    process.exitCode = 1;
    continue;
  }
  const dst = join(postedDir, `${name}.json`);
  copyFileSync(src, dst);
  writeFileSync(dst, JSON.stringify({ ...draft, posted_at: new Date().toISOString() }, null, 2));
  console.log(`✓ ${name} 올린 게시물로 표시 → ${dst}`);
}
