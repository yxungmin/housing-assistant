/**
 * 대본 JSON(social/output/*.json) → 릴스 MP4(social/video/*.mp4).
 *   npm run render -w @housing/video               재대조를 통과한 대본 전부
 *   npm run render -w @housing/video -- --id 012   한 공고만
 *
 * 재대조(verify.ts)를 통과하지 못한 대본은 렌더하지 않는다. 영상은 올리면 못 고친다.
 * 정정 댓글 파일(*.correction.json)은 영상이 아니라 댓글이라 건너뛴다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const scriptsDir = join(root, "social", "output");
const outDir = join(root, "social", "video");

const args = process.argv.slice(2);
const only = args.includes("--id") ? args[args.indexOf("--id") + 1] : undefined;

if (!existsSync(scriptsDir)) {
  console.error("대본이 없다. 먼저 npm run social:script");
  process.exit(1);
}
const files = readdirSync(scriptsDir)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".correction.json"))
  .filter((f) => !only || f.startsWith(`${only}.`));

mkdirSync(outDir, { recursive: true });
console.log("번들링…");
const serveUrl = await bundle({ entryPoint: join(here, "..", "src", "index.ts") });

let done = 0;
for (const f of files) {
  const data = JSON.parse(readFileSync(join(scriptsDir, f), "utf8"));
  if (!data.verdict?.ok) {
    console.log(`건너뜀 ${f} — 재대조를 통과하지 못한 대본`);
    continue;
  }
  const inputProps = { id: data.id, type: data.type, script: data.script };
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
  const out = join(outDir, f.replace(/\.json$/, ".mp4"));
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: out, inputProps });
  done++;
  console.log(`✓ ${out} (${(composition.durationInFrames / composition.fps).toFixed(0)}초)`);
}
console.log(`\n${done}편 → ${outDir}`);
