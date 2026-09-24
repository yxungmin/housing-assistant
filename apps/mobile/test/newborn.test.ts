import { describe, expect, it } from "vitest";
import type { EligibilityRule, UserProfile } from "@housing/schema";
import { missingStepFor } from "../src/lib/conditions";
import { visibleSteps } from "../src/lib/onboarding";

const rule = {
  group_id: "g", category: "asset", applies_to: {}, operator: "lte", value: 345_000_000, unit: "KRW",
  source: { page: 5, text: "총자산" }, confidence: 1, verified: false,
  bonuses: [{ newborn_children_min: 1, value: 379_000_000 }],
} as EligibilityRule;
const p = (x: Partial<UserProfile>) => ({ region_code: "11", total_assets: 360_000_000, ...x }) as UserProfile;

describe("출산가구 가산 — 무엇을 물을까", () => {
  it("자녀가 있는데 기준일 이후 출산 수를 모르면 그걸 묻는다", () => {
    expect(missingStepFor(rule, p({ children_count: 2 }))).toBe("newborn_children");
  });

  it("자녀 수부터 모르면 자녀 수를 먼저 묻는다", () => {
    expect(missingStepFor(rule, p({}))).toBe("children_count");
  });

  it("자녀가 없다고 답했으면 묻지 않는다", () => {
    expect(missingStepFor(rule, p({ children_count: 0 }))).toBeUndefined();
  });

  it("질문은 자녀가 있을 때만 보인다", () => {
    expect(visibleSteps(p({ children_count: 1 })).some((s) => s.id === "newborn_children")).toBe(true);
    expect(visibleSteps(p({ children_count: 0 })).some((s) => s.id === "newborn_children")).toBe(false);
  });
});
