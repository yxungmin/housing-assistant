import { describe, expect, it } from "vitest";
import type { EligibilityRule, SupplyTrack, UserProfile } from "@housing/schema";
import { matchTrack, NEWBORN_BONUS_REASON } from "../src/match";

const src = { page: 5, text: "총자산 3억4,500만원 이하, 출산자녀 1명 3억7,900만원, 2명 이상 4억1,300만원" };
const asset: EligibilityRule = {
  group_id: "g", category: "asset", applies_to: {}, operator: "lte", value: 345_000_000, unit: "KRW", source: src, confidence: 1, verified: false,
  bonuses: [{ newborn_children_min: 1, value: 379_000_000 }, { newborn_children_min: 2, value: 413_000_000 }],
};
const track = { name: "일반", unit_types: [], rule_groups: [{ id: "g", mode: "all_of", label: "기본" }], rules: [asset], pricing: [] } as SupplyTrack;
const status = (p: Partial<UserProfile>) => {
  const r = matchTrack(track, { region_code: "11", ...p } as UserProfile).groups[0]!.rules[0]!;
  return { status: r.status, reason: r.reason };
};

describe("출산가구 가산", () => {
  it("기본 상한 안이면 가산과 상관없이 맞다", () => {
    expect(status({ total_assets: 300_000_000 }).status).toBe("MATCH");
  });

  it("기본 상한을 넘어도 출산 자녀 수만큼 올라간 상한 안이면 맞다", () => {
    expect(status({ total_assets: 360_000_000, newborn_children: 1 }).status).toBe("MATCH");
    expect(status({ total_assets: 400_000_000, newborn_children: 2 }).status).toBe("MATCH");
    expect(status({ total_assets: 400_000_000, newborn_children: 1 }).status).toBe("MISMATCH");
  });

  it("출산 자녀 수를 모르면 불일치로 자르지 않는다 — 가산 안이면 확인 필요", () => {
    expect(status({ total_assets: 360_000_000 })).toEqual({ status: "NEEDS_CHECK", reason: NEWBORN_BONUS_REASON });
    // 가장 큰 가산도 넘으면 모르는 것과 상관없이 어긋난다
    expect(status({ total_assets: 500_000_000 }).status).toBe("MISMATCH");
  });

  it("자녀가 없다고 답했으면 출산 자녀도 0명으로 본다 — 묻지 않을 값 때문에 확인 필요를 만들지 않는다", () => {
    expect(status({ total_assets: 360_000_000, children_count: 0 }).status).toBe("MISMATCH");
  });
});
