import { describe, expect, it } from "vitest";
import type { PriorityRank, UserProfile } from "@housing/schema";
import { expectedRank, rankVsPast } from "../src/rank";

const src = { page: 12, text: "순위" };
const rank = (n: number, label: string, conditions: PriorityRank["conditions"] = [], extra: Partial<PriorityRank> = {}): PriorityRank =>
  ({ rank: n, label, mode: "all_of", conditions, source: src, ...extra }) as PriorityRank;

// 양산 국민임대 50㎡ 이상: 1순위 청약 24회 이상 / 2순위 6회 이상 / 3순위 그 외
const bySubscription = [
  rank(1, "청약 24회 이상 납입", [{ category: "subscription", operator: "gte", value: 24, unit: "count", applies_to: {} }]),
  rank(2, "청약 6회 이상 납입", [{ category: "subscription", operator: "gte", value: 6, unit: "count", applies_to: {} }]),
  rank(3, "그 외"),
];
const person = (p: Partial<UserProfile>) => ({ region_code: "11", household_size: 1, ...p }) as UserProfile;

describe("expectedRank", () => {
  it("조건이 맞는 첫 순위가 내 순위다", () => {
    expect(expectedRank({ priority_ranks: bySubscription }, person({ subscription_deposits: 30 }))).toMatchObject({ rank: 1, certain: true });
    expect(expectedRank({ priority_ranks: bySubscription }, person({ subscription_deposits: 10 }))).toMatchObject({ rank: 2, certain: true, label: "청약 6회 이상 납입" });
    expect(expectedRank({ priority_ranks: bySubscription }, person({ subscription_deposits: 0 }))).toMatchObject({ rank: 3, certain: true });
  });

  it("앞 순위를 판별하지 못했으면 확정하지 않는다 — 모르는 사람을 3순위로 떨어뜨리지 않는다", () => {
    const r = expectedRank({ priority_ranks: bySubscription }, person({}));
    expect(r).toMatchObject({ rank: 3, certain: false, undecided: [1, 2] });
  });

  it("순위별 접수일을 같이 돌려준다 — 다른 날 접수하면 부적격이다", () => {
    const ranks = [rank(1, "양산시 거주", [{ category: "residence", operator: "in", value: ["26"], unit: "region_code", applies_to: {} }], { apply_date: "2026-09-28" }), rank(2, "그 외", [], { apply_date: "2026-09-29" })];
    expect(expectedRank({ priority_ranks: ranks }, person({ region_code: "11" }))).toMatchObject({ rank: 2, apply_date: "2026-09-29" });
  });

  it("순위 순서가 뒤섞여 들어와도 1순위부터 본다", () => {
    expect(expectedRank({ priority_ranks: [...bySubscription].reverse() }, person({ subscription_deposits: 30 }))?.rank).toBe(1);
  });

  it("순위 기준이 없으면 null — 추첨만 하는 공급", () => {
    expect(expectedRank({}, person({}))).toBeNull();
    expect(expectedRank({ priority_ranks: [] }, person({}))).toBeNull();
  });

  it("어느 순위에도 해당하지 않으면 rank가 null", () => {
    const only1 = [bySubscription[0]!];
    expect(expectedRank({ priority_ranks: only1 }, person({ subscription_deposits: 1 }))).toMatchObject({ rank: null, certain: false });
  });
});

describe("rankVsPast", () => {
  it("마감 순위와 견준다", () => {
    expect(rankVsPast(1, 2)).toBe("ahead");
    expect(rankVsPast(2, 2)).toBe("same");
    expect(rankVsPast(3, 1)).toBe("behind");
  });
});
