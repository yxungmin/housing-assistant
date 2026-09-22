/**
 * `src/legal`의 본문으로 docs/ 아래에 웹 페이지와 md를 만든다.
 *
 * App Store Connect는 개인정보처리방침 **URL**을 요구한다 — 파일로는 제출이 안 된다.
 * 그런데 웹과 앱에 같은 글을 두 벌로 두면 반드시 어긋나고, 이 문서에서 어긋남은
 * 오타가 아니라 위법 사실의 증거다. 그래서 원본은 하나이고 여기서 만들어 낸다.
 *
 * GitHub Pages(main 브랜치 /docs)로 서비스한다. Jekyll은 끈다(.nojekyll) —
 * 우리가 만든 HTML을 그대로 내보내면 되고, 빌드 단계가 하나 줄어든다.
 *
 *   npm run legal:site
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDraft, LEGAL_DOCS, type LegalDoc } from "../src/legal";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function markdown(doc: LegalDoc): string {
  const out: string[] = [`# ${doc.title}`, ""];
  if (isDraft(doc)) {
    out.push("> **초안입니다. 법률 검토를 받기 전에는 게시하지 마세요.**", ">");
    for (const b of doc.blanks) out.push(`> - ${b}`);
    out.push("");
  }
  for (const p of doc.intro ?? []) out.push(p, "");
  for (const s of doc.sections) {
    out.push(`## ${s.heading}`, "");
    for (const line of s.body) out.push(line, "");
  }
  out.push(doc.effectiveAt ? `시행일: ${doc.effectiveAt}` : "시행일: (미정)", "");
  out.push("<!-- apps/mobile/src/legal 에서 생성됩니다. 여기서 고치지 마세요. -->", "");
  return out.join("\n");
}

/** 앱 화면과 같은 위계로 그린다. 외부 폰트·스크립트는 쓰지 않는다 — 약관을 읽는 데 네트워크가 더 필요할 이유가 없다 */
const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#17171c;--fg2:#4a4a55;--fg3:#7a7a87;--line:#e8e8ee;--warnbg:#fff7e6;--warnfg:#8a5a00;--warnline:#f0d9a8}
@media(prefers-color-scheme:dark){:root{--bg:#17171c;--fg:#f2f2f5;--fg2:#c2c2cc;--fg3:#8d8d99;--line:#2c2c34;--warnbg:#3a2f14;--warnfg:#f0c674;--warnline:#5c4a1e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;line-height:1.75;-webkit-text-size-adjust:100%}
main{max-width:44rem;margin:0 auto;padding:2.5rem 1rem 6rem}
h1{font-size:1.75rem;line-height:1.35;margin:0 0 .35rem}
h2{font-size:1.0625rem;margin:2.5rem 0 .6rem;padding-top:1.25rem;border-top:1px solid var(--line)}
p,li{color:var(--fg2);margin:.6rem 0}
ul{padding-left:1.1rem;margin:.6rem 0}
li{padding-left:.2rem}
.meta{color:var(--fg3);font-size:.875rem;margin:0 0 1.5rem}
.draft{background:var(--warnbg);color:var(--warnfg);border:1px solid var(--warnline);border-radius:.6rem;padding:.9rem 1rem;margin:1.5rem 0}
.draft strong{display:block;margin-bottom:.4rem}
.draft ul{margin:.4rem 0 0}.draft li{color:inherit}
nav{margin-bottom:2rem;font-size:.9375rem}
nav a{color:var(--fg3);text-decoration:none;margin-right:1rem;border-bottom:1px solid var(--line)}
nav a:hover{color:var(--fg)}
footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line);color:var(--fg3);font-size:.875rem}`;

function html(doc: LegalDoc): string {
  const parts: string[] = [];
  for (const s of doc.sections) {
    parts.push(`<h2>${esc(s.heading)}</h2>`);
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length) parts.push(`<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
      bullets = [];
    };
    for (const line of s.body) {
      if (line.startsWith("- ")) bullets.push(line.slice(2));
      else {
        flush();
        parts.push(`<p>${esc(line)}</p>`);
      }
    }
    flush();
  }
  const draft = isDraft(doc)
    ? `<div class="draft"><strong>작성 중인 초안입니다.</strong>아직 확정되지 않은 내용이며, 아래 항목이 비어 있습니다.<ul>${doc.blanks.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>`
    : "";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} · 공공주택 비서</title>
<meta name="robots" content="${isDraft(doc) ? "noindex" : "index"}">
<style>${CSS}</style>
</head>
<body>
<main>
<nav><a href="./">공공주택 비서</a><a href="./terms.html">이용약관</a><a href="./privacy.html">개인정보처리방침</a></nav>
<h1>${esc(doc.title)}</h1>
<p class="meta">${doc.effectiveAt ? `시행일 ${esc(doc.effectiveAt)}` : "아직 시행 전 초안"}</p>
${draft}
${(doc.intro ?? []).map((p) => `<p>${esc(p)}</p>`).join("\n")}
${parts.join("\n")}
<footer>공공주택 비서 · 이 문서는 앱 안에서도 같은 내용으로 보실 수 있습니다.</footer>
</main>
</body>
</html>
`;
}

const INDEX = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>공공주택 비서</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>공공주택 비서</h1>
<p class="meta">수도권 LH·SH 공공주택 공고를 모아 내 조건과 맞는지 보여 주는 앱입니다.</p>
<h2>문서</h2>
<ul>
<li><a href="./terms.html">이용약관</a></li>
<li><a href="./privacy.html">개인정보처리방침</a></li>
</ul>
</main>
</body>
</html>
`;

const root = resolve(import.meta.dirname, "../../..");
mkdirSync(resolve(root, "docs"), { recursive: true });
// Jekyll을 끈다 — 우리가 만든 HTML을 그대로 내보내면 되고 빌드 단계가 하나 줄어든다
writeFileSync(resolve(root, "docs/.nojekyll"), "");
writeFileSync(resolve(root, "docs/index.html"), INDEX);
for (const doc of Object.values(LEGAL_DOCS)) {
  writeFileSync(resolve(root, `docs/${doc.key}.md`), markdown(doc));
  writeFileSync(resolve(root, `docs/${doc.key}.html`), html(doc));
  console.log(`${doc.key}: md + html ${isDraft(doc) ? "(초안 — noindex)" : ""}`);
}
console.log("→ docs/ (GitHub Pages: main 브랜치 /docs)");
