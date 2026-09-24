import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmExtraction, toExtractionOutput } from "../src/llm/llmSchema";

const src = { page: 3, text: "원문" };

describe("LlmExtraction → ExtractionOutput", () => {
  it("converts nulls to undefined and parses value_json per operator", () => {
    const llm = LlmExtraction.parse({
      title: "t",
      housing_type: "happy",
      address: null,
      schedule: { notice_date: "2026-09-01", apply_start: null, apply_end: null, winner_announce: null, move_in: null },
      tracks: [
        {
          name: "청년",
          households: null,
          unit_types: [{ name: "26", exclusive_area_m2: null, households: 10 }],
          rule_groups: [{ id: "basic", mode: "all_of", label: "기본" }],
          rules: [
            { group_id: "basic", category: "age", applies_to: { household_size: null, household_size_min: null, household_size_max: null, income_type: null, marriage: null }, operator: "between", value_json: "[19,39]", unit: "years", source: src, confidence: 0.9 },
            { group_id: "basic", category: "income", applies_to: { household_size: 1, household_size_min: null, household_size_max: null, income_type: "single", marriage: null }, operator: "lte", value_json: "3,500,000", unit: "KRW_monthly", source: src, confidence: 0.9 },
            { group_id: "basic", category: "residence", applies_to: { household_size: null, household_size_min: null, household_size_max: null, income_type: null, marriage: null }, operator: "in", value_json: "[\"11\",\"41\"]", unit: "region_code", source: src, confidence: 0.9 },
          ],
          pricing: [
            { unit_type: "26", tier: null, kind: "rental", deposit: 40000000, monthly_rent: 200000, sale_price: null, conversion: { rate: 0.07, rate_down: 0.035, max_deposit: 60000000, min_deposit: null }, payment_schedule: null, maintenance_estimate: null, source: src },
          ],
          priority_ranks: [],
          selection_order: null,
        },
      ],
      notes: [],
    });
    const out = toExtractionOutput(llm);
    expect(out.success).toBe(true);
    if (!out.success) return;
    const track = out.data.tracks[0]!;
    expect(track.rules[0]!.value).toEqual([19, 39]);
    expect(track.rules[1]!.value).toBe(3500000);
    expect(track.rules[1]!.applies_to).toEqual({ household_size: 1, income_type: "single" });
    expect(track.rules[2]!.value).toEqual(["11", "41"]);
    expect(track.pricing[0]!.conversion).toEqual({ rate: 0.07, rate_down: 0.035, max_deposit: 60000000 });
    expect(track.households).toBeUndefined();
  });

  it("still enforces internal rules (unknown group id fails)", () => {
    const llm = LlmExtraction.parse({
      title: "t", housing_type: "happy", address: null,
      schedule: { notice_date: null, apply_start: null, apply_end: null, winner_announce: null, move_in: null },
      tracks: [{ name: "x", households: null, unit_types: [], rule_groups: [], rules: [
        { group_id: "missing", category: "age", applies_to: { household_size: null, household_size_min: null, household_size_max: null, income_type: null, marriage: null }, operator: "gte", value_json: "19", unit: null, source: src, confidence: 1 },
      ], pricing: [], priority_ranks: [], selection_order: null }],
      notes: [],
    });
    expect(toExtractionOutput(llm).success).toBe(false);
  });

  it("emits a JSON schema without tuples or items:false", () => {
    const json = JSON.stringify(z.toJSONSchema(LlmExtraction, { io: "input" }));
    expect(json).not.toContain("prefixItems");
    expect(json).not.toContain('"items":false');
  });
});

describe("v4에서 줄인 출력 (2026-09-21)", () => {
  /** 출력 토큰이 추출 비용의 70%다. 모델이 만들 필요가 없는 값은 받지 않는다. */
  const base = (rule: Record<string, unknown>, pricing: Record<string, unknown>) => ({
    title: "t",
    housing_type: "happy" as const,
    address: null,
    schedule: { notice_date: null, apply_start: null, apply_end: null, winner_announce: null, move_in: null },
    tracks: [
      {
        name: "청년",
        households: null,
        unit_types: [{ name: "26", exclusive_area_m2: null, households: null }],
        rule_groups: [{ id: "basic", mode: "all_of" as const, label: "기본" }],
        rules: [{ group_id: "basic", category: "age", operator: "gte", value_json: "19", unit: "years", source: src, confidence: 0.9, ...rule }],
        pricing: [{ unit_type: "26", tier: null, kind: "rental", deposit: 1, monthly_rent: 1, sale_price: null, conversion: null, maintenance_estimate: null, source: src, ...pricing }],
        priority_ranks: [],
        selection_order: null,
      },
    ],
    notes: [],
  });

  it("applies_to를 객체째 null로 보낼 수 있다 — 530룰 중 240번이 전부 null이었다", () => {
    const out = toExtractionOutput(LlmExtraction.parse(base({ applies_to: null }, {})));
    expect(out.success).toBe(true);
    if (!out.success) return;
    // 내부 스키마는 빈 객체를 쓴다 ("모두에게 적용"). 판정하는 쪽 코드는 그대로 둔다.
    expect(out.data.tracks[0]!.rules[0]!.applies_to).toEqual({});
  });

  it("대상이 한정될 때는 예전처럼 채워 보낸다", () => {
    const applies_to = { household_size: 3, household_size_min: null, household_size_max: null, income_type: "dual", marriage: null };
    const out = toExtractionOutput(LlmExtraction.parse(base({ applies_to }, {})));
    expect(out.success).toBe(true);
    if (!out.success) return;
    expect(out.data.tracks[0]!.rules[0]!.applies_to).toEqual({ household_size: 3, income_type: "dual" });
  });

  it("payment_schedule은 받지 않는다 — 보내와도 무시하고 통과시킨다", () => {
    const withIt = base({ applies_to: null }, { payment_schedule: [{ label: "계약금", ratio: 0.1, due: null }] });
    const out = toExtractionOutput(LlmExtraction.parse(withIt));
    expect(out.success).toBe(true);
    if (!out.success) return;
    expect(out.data.tracks[0]!.pricing[0]!.payment_schedule).toBeUndefined();
  });
});

describe("순위 (v5)", () => {
  const withRanks = (priority_ranks: unknown[], selection_order: string[] | null) => ({
    title: "t", housing_type: "national_rental", address: null,
    schedule: { notice_date: null, apply_start: null, apply_end: null, winner_announce: null, move_in: null },
    tracks: [{ name: "일반공급", households: null, unit_types: [], rule_groups: [], rules: [], pricing: [], priority_ranks, selection_order }],
    notes: [],
  });

  it("순위 조건과 순위별 접수일을 옮긴다", () => {
    const out = toExtractionOutput(LlmExtraction.parse(withRanks([
      { rank: 1, label: "양산시 거주자", mode: "all_of", conditions: [{ category: "residence", applies_to: null, operator: "in", value_json: "[\"경남 양산시\"]", unit: "region_code" }], apply_date: "2026-09-28", source: src },
      { rank: 2, label: "그 외", mode: "all_of", conditions: [], apply_date: "2026-09-29", source: src },
    ], ["rank", "score", "lottery"])));
    expect(out.success).toBe(true);
    if (!out.success) return;
    const t = out.data.tracks[0]!;
    expect(t.priority_ranks?.[0]).toMatchObject({ rank: 1, apply_date: "2026-09-28", conditions: [{ category: "residence", value: ["경남 양산시"], applies_to: {} }] });
    expect(t.priority_ranks?.[1]?.conditions).toEqual([]);
    expect(t.selection_order).toEqual(["rank", "score", "lottery"]);
  });

  it("순위제가 아니면 필드를 남기지 않는다 — 빈 배열과 없음을 같게 본다", () => {
    const out = toExtractionOutput(LlmExtraction.parse(withRanks([], null)));
    expect(out.success).toBe(true);
    if (!out.success) return;
    expect(out.data.tracks[0]!.priority_ranks).toBeUndefined();
    expect(out.data.tracks[0]!.selection_order).toBeUndefined();
  });

  it("같은 순위가 두 번 나오면 거부한다", () => {
    const dup = { rank: 1, label: "x", mode: "all_of", conditions: [], apply_date: null, source: src };
    expect(toExtractionOutput(LlmExtraction.parse(withRanks([dup, dup], null))).success).toBe(false);
  });
});
