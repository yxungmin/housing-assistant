import { describe, expect, it } from "vitest";
import type { ExtractionOutput } from "@housing/schema";
import { advisoryChecks, autoChecks, blockingChecks } from "../src/validate/autoChecks";

const src = { page: 1, text: "x" };
const base: ExtractionOutput = {
  title: "테스트 공고",
  housing_type: "happy",
  schedule: { notice_date: "2026-09-01", apply_start: "2026-09-10", apply_end: "2026-09-12" },
  tracks: [
    {
      name: "일반공급",
      households: 30,
      unit_types: [
        { name: "26", households: 10 },
        { name: "36", households: 20 },
      ],
      rule_groups: [{ id: "g", mode: "all_of", label: "기본" }],
      rules: [{ group_id: "g", category: "income", applies_to: {}, operator: "lte", value: 7_200_000, source: src, confidence: 0.9, verified: false }],
      pricing: [{ unit_type: "26", kind: "rental", deposit: 40_000_000, monthly_rent: 200_000, source: src }],
    },
  ],
  notes: [],
};

const messages = (x: Parameters<typeof autoChecks>[0]) => autoChecks(x).map((i) => i.message);

describe("autoChecks", () => {
  it("passes a consistent extraction", () => {
    expect(autoChecks(base)).toEqual([]);
  });
  it("flags reversed schedule", () => {
    const issues = messages({ ...base, schedule: { apply_start: "2026-09-12", apply_end: "2026-09-10" } });
    expect(issues.some((i) => i.includes("접수 시작"))).toBe(true);
  });
  it("flags household sum mismatch", () => {
    const t = { ...base.tracks[0]!, households: 31 };
    expect(messages({ ...base, tracks: [t] }).some((i) => i.includes("세대수 합계"))).toBe(true);
  });
  it("flags implausible income cap (annual pasted as monthly)", () => {
    const t = { ...base.tracks[0]!, rules: [{ ...base.tracks[0]!.rules[0]!, value: 86_400_000 }] };
    expect(messages({ ...base, tracks: [t] }).some((i) => i.includes("연소득"))).toBe(true);
  });
  it("flags rent unit errors and missing pricing", () => {
    const t = { ...base.tracks[0]!, pricing: [{ ...base.tracks[0]!.pricing[0]!, monthly_rent: 20 }] };
    expect(messages({ ...base, tracks: [t] }).some((i) => i.includes("단위 누락"))).toBe(true);
    expect(messages({ ...base, tracks: [{ ...base.tracks[0]!, pricing: [] }] }).some((i) => i.includes("가격 정보 없음"))).toBe(true);
  });

  it("게시를 막는 지적과 알리기만 할 지적을 나눈다", () => {
    // 가격 정보 없음: 조건 매칭은 그대로 쓸 수 있으니 게시한다
    const noPrice = autoChecks({ ...base, tracks: [{ ...base.tracks[0]!, pricing: [] }] });
    expect(blockingChecks(noPrice)).toEqual([]);
    expect(advisoryChecks(noPrice).some((m) => m.includes("가격 정보 없음"))).toBe(true);

    // 소득 상한이 연소득으로 들어온 경우: 숫자를 믿을 수 없으니 게시하지 않는다
    const badIncome = autoChecks({
      ...base,
      tracks: [{ ...base.tracks[0]!, rules: [{ ...base.tracks[0]!.rules[0]!, value: 86_400_000 }] }],
    });
    expect(blockingChecks(badIncome).some((m) => m.includes("연소득"))).toBe(true);
  });

  it("신뢰도가 낮은 룰은 게시를 막지 않는다 (화면에서 확인 필요로 내린다)", () => {
    const low = autoChecks({
      ...base,
      tracks: [{ ...base.tracks[0]!, rules: [{ ...base.tracks[0]!.rules[0]!, confidence: 0.3 }] }],
    });
    expect(blockingChecks(low)).toEqual([]);
    expect(advisoryChecks(low).some((m) => m.includes("신뢰도"))).toBe(true);
  });
});
