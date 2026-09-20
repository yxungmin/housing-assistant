import type { PdfPage } from "./extract.js";

export type SectionKind = "eligibility" | "pricing" | "schedule" | "supply" | "other";

export interface Section {
  kind: SectionKind;
  /** 이 섹션이 걸친 페이지들 */
  pages: number[];
  text: string;
}

const KIND_PATTERNS: [SectionKind, RegExp][] = [
  ["eligibility", /(입주자격|신청자격|자격요건|소득기준|자산기준|소득\s*및\s*자산|무주택|청약통장|우선공급|일반공급\s*자격)/],
  ["pricing", /(임대조건|임대보증금|월임대료|공급금액|분양가|전환보증금|주택형별|임대료\s*및|보증금\s*및)/],
  ["schedule", /(모집일정|신청일정|접수일정|당첨자\s*발표|입주\s*예정|계약체결|서류제출)/],
  ["supply", /(공급대상|공급개요|공급내역|공급세대|단지개요|주택형|전용면적)/],
];

/** 페이지 단위로 섹션 종류를 추정한다. 한 페이지에 여러 종류가 섞이면 모두 포함시킨다. */
export function classifyPage(text: string): SectionKind[] {
  const kinds = KIND_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
  return kinds.length ? kinds : ["other"];
}

/**
 * LLM에 넘길 섹션 묶음. 종류별로 관련 페이지를 모아 "=== p.N ===" 표시와 함께 이어붙인다.
 * 페이지 표시는 LLM이 source.page를 채우는 근거가 된다.
 */
export function buildSections(pages: PdfPage[]): Section[] {
  const buckets = new Map<SectionKind, PdfPage[]>();
  for (const page of pages) {
    for (const kind of classifyPage(page.text)) {
      const list = buckets.get(kind) ?? [];
      list.push(page);
      buckets.set(kind, list);
    }
  }
  const sections: Section[] = [];
  for (const [kind, list] of buckets) {
    sections.push({
      kind,
      pages: list.map((p) => p.page),
      text: list.map((p) => `=== p.${p.page} ===\n${p.text}`).join("\n\n"),
    });
  }
  const order: SectionKind[] = ["supply", "eligibility", "pricing", "schedule", "other"];
  sections.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return sections;
}

/**
 * LLM 입력용 텍스트. 페이지는 원문 순서로 한 번씩만 들어가고(중복 없음), 각 페이지 머리에
 * 추정 섹션 종류를 태그로 붙인다. 길이 상한을 넘으면 other로만 분류된 페이지부터 뺀다.
 * 실측: 행복주택 공고 58쪽 ≈ 88,000자, 33쪽 ≈ 50,000자 → 1M 컨텍스트 모델에 통째로 넣어도 된다.
 */
export function sectionsToPrompt(sections: Section[], maxChars = 400_000): string {
  const kindsByPage = new Map<number, SectionKind[]>();
  const textByPage = new Map<number, string>();
  for (const s of sections) {
    const chunks = s.text.split(/\n(?==== p\.\d+ ===)/);
    for (const chunk of chunks) {
      const m = /^=== p\.(\d+) ===\n?([\s\S]*)$/.exec(chunk.trim());
      if (!m) continue;
      const page = Number(m[1]);
      kindsByPage.set(page, [...(kindsByPage.get(page) ?? []), s.kind]);
      if (!textByPage.has(page)) textByPage.set(page, m[2] ?? "");
    }
  }
  const pages = [...textByPage.keys()].sort((a, b) => a - b);
  const render = (page: number) =>
    `=== p.${page} [${(kindsByPage.get(page) ?? ["other"]).join(",")}] ===\n${textByPage.get(page) ?? ""}`;
  let total = pages.reduce((a, p) => a + render(p).length + 2, 0);
  const included = new Set(pages);
  if (total > maxChars) {
    for (const p of [...pages].reverse()) {
      const kinds = kindsByPage.get(p) ?? ["other"];
      if (kinds.length === 1 && kinds[0] === "other") {
        included.delete(p);
        total -= render(p).length + 2;
        if (total <= maxChars) break;
      }
    }
  }
  return pages.filter((p) => included.has(p)).map(render).join("\n\n");
}
