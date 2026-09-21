/**
 * 아이콘 미리보기 HTML. `src/components/icon/icons.ts`의 SVG 문자열을 그대로 그려서,
 * 눈으로 확인한 모양과 앱에 나가는 모양이 갈리지 않게 한다.
 * `npm run icon:preview` → scripts/icon-preview.html
 *
 * 두 가족을 갈라서 보여 준다. 선 아이콘(MONO)은 쓰는 쪽 색을 따르므로 여러 색으로 찍어 보고,
 * 그림 아이콘(ASSET)은 색이 박혀 있으므로 배경만 바꿔 본다.
 * 다크 배경을 같이 그리는 이유는 ASSET 팔레트에 흰색과 아주 연한 초록이 들어 있어서다 —
 * 어두운 화면에서 눈부시거나 사라지는 자리는 여기서 보인다.
 *
 * 색은 화면과 같은 값이어야 한다. 그래서 hex를 여기 적지 않고 `theme/tokens`를 읽는다.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ASSET_ICON_NAMES, ICON_SIZE, MONO_ICON_NAMES, svgFor } from "../src/components/icon/icons";
import { dark, light } from "../src/theme/tokens";

/** 원본은 24px로 적혀 있다. 크기만 갈아 끼우고 도형은 건드리지 않는다. */
const at = (name: string, size: number) => svgFor(name as never).replace('width="24" height="24"', `width="${size}" height="${size}"`);

const cell = (name: string, size: number) =>
  `<figure><div class="box" style="width:${size + 28}px;height:${size + 28}px">${at(name, size)}</div><figcaption>${name}</figcaption></figure>`;

const grid = (names: readonly string[], size: number, cls = "") =>
  `<div class="grid ${cls}">${names.map((n) => cell(n, size)).join("")}</div>`;

const section = (title: string, inner: string) => `<h2>${title}</h2>${inner}`;

const html = `<!doctype html><meta charset="utf-8"><title>아이콘</title><style>
body{font:13px -apple-system,system-ui,sans-serif;margin:20px;background:${light.surface};color:${light.text}}
h2{font-size:14px;margin:26px 0 10px;color:${light.text3};font-weight:600}
h3{font-size:12px;margin:14px 0 6px;color:${light.text4};font-weight:500}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
figure{margin:0;text-align:center}
.box{display:flex;align-items:center;justify-content:center;background:${light.card};border-radius:12px;margin:0 auto}
figcaption{margin-top:5px;font-size:9px;color:${light.text4};word-break:break-all;line-height:1.3}
.ink{color:${light.text}} .muted{color:${light.text3}} .brand{color:${light.primary}}
.warn{color:${light.warning}} .danger{color:${light.danger}}
.dark{background:${dark.surface};color:${dark.text};padding:16px;border-radius:16px;margin-top:8px}
.dark .box{background:${dark.card}}
.dark figcaption{color:${dark.text4}}
.dark h3{color:${dark.text4}}
</style>

${section("검토 — 96px (다듬는 중인 것만)", grid(["walk", "user-edit", "user", "alert", "settings", "delete"], 96, "ink"))}
${section("선 아이콘 (MONO) — 48px, 본문색", grid(MONO_ICON_NAMES, 48, "ink"))}
${section(`선 아이콘 — ${ICON_SIZE}px (실제 사용 크기)`, grid(MONO_ICON_NAMES, ICON_SIZE, "ink"))}
${section("선 아이콘 — 16px (가장 작게 쓰는 크기)", grid(MONO_ICON_NAMES, 16, "ink"))}
${section(
  "선 아이콘 — 색은 쓰는 쪽이 정한다",
  `<h3>보조 글자색</h3>${grid(["info", "clock", "search", "more"], 32, "muted")}
   <h3>브랜드</h3>${grid(["check", "check-circle", "heart-filled", "bell"], 32, "brand")}
   <h3>경고</h3>${grid(["alert", "info"], 32, "warn")}
   <h3>위험</h3>${grid(["x-circle", "trash", "x"], 32, "danger")}`,
)}

${section("그림 아이콘 (ASSET) — 48px, 색이 박혀 있다", grid(ASSET_ICON_NAMES, 48))}
${section(`그림 아이콘 — ${ICON_SIZE}px`, grid(ASSET_ICON_NAMES, ICON_SIZE))}

${section("다크 배경", `<div class="dark">${grid(MONO_ICON_NAMES, 40, "")}${grid(ASSET_ICON_NAMES, 40)}</div>`)}`;

const out = join(import.meta.dirname, "icon-preview.html");
writeFileSync(out, html);
console.log(`선 ${MONO_ICON_NAMES.length}종 · 그림 ${ASSET_ICON_NAMES.length}종 → ${out}`);
