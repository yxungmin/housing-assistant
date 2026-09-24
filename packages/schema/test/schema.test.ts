import { describe, expect, it } from "vitest";
import { EligibilityRule, ExtractionOutput, Pricing, SupplyTrack } from "../src/index";

const source = { page: 17, text: "3인 이하 맞벌이의 경우 월평균소득 120% 이하" };

describe("EligibilityRule", () => {
  it("accepts a lte income rule", () => {
    const r = EligibilityRule.parse({
      group_id: "income_cap",
      category: "income",
      applies_to: { household_size: 3, income_type: "dual" },
      operator: "lte",
      value: 8640000,
      unit: "KRW_monthly",
      source,
      confidence: 0.94,
    });
    expect(r.verified).toBe(false);
  });

  it("rejects between with reversed bounds", () => {
    const res = EligibilityRule.safeParse({
      group_id: "g",
      category: "age",
      operator: "between",
      value: [39, 19],
      source,
      confidence: 0.9,
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative income cap", () => {
    const res = EligibilityRule.safeParse({
      group_id: "g",
      category: "income",
      operator: "lte",
      value: -1,
      source,
      confidence: 0.9,
    });
    expect(res.success).toBe(false);
  });
});

describe("Pricing", () => {
  it("requires deposit and rent for rental", () => {
    expect(Pricing.safeParse({ unit_type: "36", kind: "rental", deposit: 1000, source }).success).toBe(false);
    expect(Pricing.safeParse({ unit_type: "36", kind: "rental", deposit: 1000, monthly_rent: 10, source }).success).toBe(true);
  });
});

describe("SupplyTrack", () => {
  it("rejects rules pointing at undefined groups", () => {
    const res = SupplyTrack.safeParse({
      name: "일반공급",
      rule_groups: [{ id: "a", mode: "all_of", label: "기본" }],
      rules: [{ group_id: "b", category: "age", operator: "gte", value: 19, source, confidence: 0.9 }],
    });
    expect(res.success).toBe(false);
  });

  it("accepts an any_of newlywed group", () => {
    const res = SupplyTrack.safeParse({
      name: "신혼부부 우선공급",
      rule_groups: [{ id: "newlywed", mode: "any_of", label: "신혼부부 자격" }],
      rules: [
        { group_id: "newlywed", category: "marriage", operator: "lte", value: 7, unit: "years", source, confidence: 0.9 },
        { group_id: "newlywed", category: "children", operator: "lte", value: 6, unit: "child_age", source, confidence: 0.9 },
      ],
    });
    expect(res.success).toBe(true);
  });
});

describe("ExtractionOutput", () => {
  it("needs at least one track", () => {
    const res = ExtractionOutput.safeParse({ title: "t", housing_type: "happy", schedule: {}, tracks: [] });
    expect(res.success).toBe(false);
  });
});

describe("PriorityRank", () => {
  const src = { page: 3, text: "1순위 : 해당 주택건설지역 거주자" };
  const track = (priority_ranks: unknown[]) => ({ name: "일반공급", priority_ranks });

  it("순위와 조건, 순위별 접수일을 받는다. 조건이 빈 순위는 '나머지'다", () => {
    const r = SupplyTrack.safeParse(track([
      { rank: 1, label: "양산시 거주자", conditions: [{ category: "residence", operator: "in", value: ["경남 양산시"] }], apply_date: "2026-09-28", source: src },
      { rank: 2, label: "그 외", source: src },
    ]));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.priority_ranks?.[0]?.mode).toBe("all_of");
    expect(r.data.priority_ranks?.[1]?.conditions).toEqual([]);
  });

  it("같은 순위가 두 번이면 거부한다", () => {
    expect(SupplyTrack.safeParse(track([{ rank: 1, label: "a", source: src }, { rank: 1, label: "b", source: src }])).success).toBe(false);
  });

  it("없어도 된다 — 추첨만 하는 공급", () => {
    const r = SupplyTrack.safeParse({ name: "일반공급" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.priority_ranks).toBeUndefined();
  });
});

describe("예시 정답 (benchmark/fixtures/000.example.json)", () => {
  // 스키마를 바꾸면 이 파일도 같이 고친다 (CLAUDE.md). 안 고치면 여기서 깨진다.
  it("내부 스키마를 통과한다", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../../../benchmark/fixtures/000.example.json"), "utf8"));
    const r = ExtractionOutput.safeParse(raw.gold);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tracks[0]!.priority_ranks?.length).toBe(2);
  });
});

describe("v6 필드", () => {
  const source = { page: 5, text: "총자산 3억4,500만원 이하 (출산자녀 1명 +10%p)" };
  const assetRule = (extra: Record<string, unknown>) => ({ group_id: "g", category: "asset", operator: "lte", value: 345000000, unit: "KRW", source, confidence: 1, ...extra });

  it("가산은 숫자 상한(lte) 룰에만 붙는다", () => {
    expect(EligibilityRule.safeParse(assetRule({ bonuses: [{ newborn_children_min: 1, value: 379000000 }] })).success).toBe(true);
    expect(EligibilityRule.safeParse(assetRule({ operator: "gte", bonuses: [{ newborn_children_min: 1, value: 1 }] })).success).toBe(false);
  });

  it("접수 방법·서류 일정·거주 기간을 받는다", () => {
    const r = ExtractionOutput.safeParse({
      title: "t", housing_type: "national_rental",
      schedule: { documents_announce: "2026-10-16", documents_end: "2026-10-23", contract_start: "2027-02-15" },
      application: { online: false, onsite: true, place: "관리사무소" },
      tracks: [{ name: "일반", residence: { contract_years: 2, max_years: 30 } }],
    });
    expect(r.success).toBe(true);
  });
});
