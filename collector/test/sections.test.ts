import { describe, expect, it } from "vitest";
import { buildSections, classifyPage, sectionsToPrompt } from "../src/pdf/sections.js";

describe("sections", () => {
  it("classifies pages by keyword", () => {
    expect(classifyPage("입주자격 및 소득기준 ...")).toEqual(["eligibility"]);
    expect(classifyPage("주택형별 임대보증금 및 월임대료")).toEqual(expect.arrayContaining(["pricing", "supply"]));
    expect(classifyPage("표지")).toEqual(["other"]);
  });
  it("groups pages and keeps page markers for source.page", () => {
    const sections = buildSections([
      { page: 1, text: "표지" },
      { page: 2, text: "입주자격: 무주택세대구성원" },
      { page: 3, text: "임대조건 보증금 6,000만원" },
      { page: 4, text: "모집일정 접수 9.10~9.12" },
    ]);
    expect(sections.map((s) => s.kind)).toEqual(["eligibility", "pricing", "schedule", "other"]);
    const prompt = sectionsToPrompt(sections);
    expect(prompt).toContain("=== p.2 [eligibility] ===");
    expect(prompt).toContain("=== p.3 [pricing] ===");
    // 페이지는 원문 순서로 한 번씩만
    expect(prompt.match(/=== p\.\d+/g)).toHaveLength(4);
    expect(prompt.indexOf("p.1 ")).toBeLessThan(prompt.indexOf("p.2 "));
  });

  it("tags multi-kind pages once and drops other-only pages when over budget", () => {
    const sections = buildSections([
      { page: 1, text: "표지 ".repeat(50) },
      { page: 2, text: "입주자격과 임대조건 및 주택형별 보증금" },
    ]);
    const prompt = sectionsToPrompt(sections, 120);
    expect(prompt).not.toContain("p.1");
    expect(prompt).toMatch(/=== p\.2 \[[a-z,]+\] ===/);
    expect(prompt.match(/=== p\.2/g)).toHaveLength(1);
  });
});
