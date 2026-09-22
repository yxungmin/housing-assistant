/**
 * `src/legal`의 본문으로 docs/*.md를 만든다.
 *
 * App Store는 개인정보처리방침 **URL**을 요구해서 웹에도 같은 글이 있어야 하는데,
 * 두 벌을 손으로 맞추면 반드시 어긋난다. 이 문서에서 어긋남은 오타가 아니라
 * 위법 사실의 증거다 — 방침에 적은 것과 실제가 다른 것이니까.
 *
 *   npm run legal:md -w @housing/mobile
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LEGAL_DOCS, isDraft, type LegalDoc } from "../src/legal";

function render(doc: LegalDoc): string {
  const out: string[] = [`# ${doc.title}`, ""];
  if (isDraft(doc)) {
    out.push("> **초안입니다. 법률 검토를 받기 전에는 게시하지 마세요.**", ">");
    if (doc.blanks.length > 0) {
      out.push("> 채워야 하는 항목:");
      for (const b of doc.blanks) out.push(`> - ${b}`);
    }
    out.push("");
  }
  for (const p of doc.intro ?? []) out.push(p, "");
  for (const s of doc.sections) {
    out.push(`## ${s.heading}`, "");
    for (const line of s.body) out.push(line, "");
  }
  out.push(doc.effectiveAt ? `시행일: ${doc.effectiveAt}` : "시행일: (미정)", "");
  out.push("<!-- 이 파일은 apps/mobile/src/legal 에서 생성됩니다. 여기서 고치지 마세요. -->", "");
  return out.join("\n");
}

const root = resolve(import.meta.dirname, "../../..");
for (const doc of Object.values(LEGAL_DOCS)) {
  const path = resolve(root, `docs/${doc.key}.md`);
  writeFileSync(path, render(doc));
  console.log(`${doc.key}.md ${isDraft(doc) ? "(초안)" : ""}`);
}
