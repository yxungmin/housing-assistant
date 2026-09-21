/**
 * 아이콘 미리보기 HTML. `src/components/icon/icons.ts`의 도형 데이터를 그대로 그려서,
 * 눈으로 확인한 모양과 앱에 나가는 모양이 갈리지 않게 한다.
 * `npm run icon:preview` → scripts/icon-preview.html
 *
 * 색도 화면과 같은 값이어야 한다. 그래서 여기에 hex를 적지 않고 `theme/tokens`의
 * 라이트 테마 값을 그대로 읽는다 — 토큰을 바꾸면 미리보기도 같이 바뀐다.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ICONS, ICON_NAMES, ICON_STROKE_WIDTH, type Shape } from "../src/components/icon/icons";
import { light } from "../src/theme/tokens";

const LINE = light.text;
const ACCENT = light.primary;

function svg(shapes: Shape[], size: number, sw: number): string {
  const body = shapes
    .map((s) => {
      const stroke = (s.tone ?? "line") === "accent" ? ACCENT : LINE;
      const common = s.fill ? `fill="${stroke}" stroke="none"` : `fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
      if (s.k === "path") return `<path d="${s.d}" ${common}/>`;
      if (s.k === "circle") return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${common}/>`;
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx ?? 0}" ${common}/>`;
    })
    .join("");
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${body}</svg>`;
}

const cell = (name: string, size: number, sw: number) =>
  `<figure><div class="box">${svg(ICONS[name as never], size, sw)}</div><figcaption>${name}</figcaption></figure>`;

const grid = (label: string, size: number, sw: number) =>
  `<h2>${label}</h2><div class="grid">${ICON_NAMES.map((n) => cell(n, size, sw)).join("")}</div>`;

/** 다듬는 중인 것만 크게 본다 — 지금은 초록을 뺀 조작 아이콘들이 16px에서도 읽히는지 */
const FOCUS = ["search", "filter", "settings", "bell", "trash", "chat", "user", "more", "x-circle"];
const focusGrid = `<h2>검토: 초록을 뺀 조작 아이콘 (96px)</h2><div class="grid">${FOCUS.map((n) => cell(n, 96, 2)).join("")}</div>`;

const html = `<!doctype html><meta charset="utf-8"><title>아이콘</title><style>
body{font:14px -apple-system,system-ui,sans-serif;background:#fff;color:#22272B;margin:24px}
h2{font-size:15px;margin:28px 0 12px;color:#6b7280}
.grid{display:grid;grid-template-columns:repeat(9,1fr);gap:14px}
figure{margin:0;text-align:center}
.box{display:flex;align-items:center;justify-content:center;min-height:56px;padding:10px 0;background:#F4F5F6;border-radius:12px}
figcaption{margin-top:6px;font-size:10px;color:#9aa1a8;word-break:break-all}
</style>${focusGrid}${grid("48px (크게)", 48, 2)}${grid("24px (실제 사용 크기)", 24, 2)}${grid("16px (가장 작게 쓰는 크기)", 16, ICON_STROKE_WIDTH + 0.2)}`;

const out = join(import.meta.dirname, "icon-preview.html");
writeFileSync(out, html);
console.log(`${ICON_NAMES.length}종 → ${out}`);
