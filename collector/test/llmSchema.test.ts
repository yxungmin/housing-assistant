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
      ], pricing: [] }],
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
