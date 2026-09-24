import { describe, expect, it } from "vitest";
import type { PriorityRank, UserProfile } from "@housing/schema";
import { expectedRank, rankGuard, rankVsPast } from "../src/rank";
import { matchAnnouncement } from "../src/match";

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

  it("가구 유형별로 갈린 any_of 조건은 내 유형 것만 본다 — 남의 갈래를 맞은 것으로 세면 모두가 그 순위가 된다", () => {
    // 012 신혼·신생아 매입임대 2순위: 신혼부부는 미성년 자녀 / 한부모는 6세 이하 자녀
    const r2 = rank(2, "자녀 있는 신혼 / 6세 이하 자녀 한부모", [
      { category: "children", operator: "lte", value: 18, unit: "child_age", applies_to: { marriage: ["married", "pre_marriage"] } },
      { category: "children", operator: "lte", value: 6, unit: "child_age", applies_to: { marriage: ["single_parent"] } },
    ], { mode: "any_of" });
    const ranks = [r2, rank(3, "그 외")];
    // 자녀 없는 신혼부부: 자기 갈래(미성년 자녀)가 어긋나고 한부모 갈래는 해당 없음 → 2순위가 아니다
    expect(expectedRank({ priority_ranks: ranks }, person({ marriage: "married", children_count: 0, children_ages: [] }))?.rank).toBe(3);
    // 8세 자녀 한부모: 자기 갈래(6세 이하)가 어긋난다 → 3순위. 신혼 갈래(18세 이하)를 보면 틀리게 2순위가 된다
    expect(expectedRank({ priority_ranks: ranks }, person({ marriage: "single_parent", children_count: 1, children_ages: [8] }))?.rank).toBe(3);
    expect(expectedRank({ priority_ranks: ranks }, person({ marriage: "single_parent", children_count: 1, children_ages: [4] }))?.rank).toBe(2);
    // 미혼: 어느 갈래에도 해당하지 않는다 → 이 순위가 아니다
    expect(expectedRank({ priority_ranks: ranks }, person({ marriage: "single", children_count: 0 }))?.rank).toBe(3);
  });

  it("순위 기준이 없으면 null — 추첨만 하는 공급", () => {
    expect(expectedRank({}, person({}))).toBeNull();
    expect(expectedRank({ priority_ranks: [] }, person({}))).toBeNull();
  });

  it("어느 순위에도 해당하지 않으면 rank가 null", () => {
    const only1 = [bySubscription[0]!];
    // 판별은 다 했는데 맞는 순위가 없다 — 확실히 "어느 순위도 아님"이다 (rankGuard가 이걸 본다)
    expect(expectedRank({ priority_ranks: only1 }, person({ subscription_deposits: 1 }))).toMatchObject({ rank: null, certain: true });
  });
});

describe("rankVsPast", () => {
  it("마감 순위와 견준다", () => {
    expect(rankVsPast(1, 2)).toBe("ahead");
    expect(rankVsPast(2, 2)).toBe("same");
    expect(rankVsPast(3, 1)).toBe("behind");
  });
});

describe("rankGuard", () => {
  // 012 v7 추출: 자격 룰 없이 순위만 있는 트랙 (rules에는 소득·자산만)
  const ranksOnly = [
    rank(1, "신생아 가구 / 지원대상 한부모", [
      { category: "children", operator: "lte", value: 1, unit: "child_age", applies_to: {} },
      { category: "status", operator: "in", value: ["single_parent_support"], unit: "status", applies_to: {} },
    ], { mode: "any_of" }),
    rank(3, "신혼부부·예비신혼부부", [
      { category: "marriage", operator: "lte", value: 7, unit: "years", applies_to: {} },
      { category: "marriage", operator: "in", value: ["pre_marriage"], unit: "status", applies_to: {} },
    ], { mode: "any_of" }),
  ];
  const track = { name: "신혼·신생아 매입임대", unit_types: [], rule_groups: [], rules: [], pricing: [], priority_ranks: ranksOnly } as unknown as Parameters<typeof matchAnnouncement>[0]["tracks"][number];

  it("어느 순위에도 해당하지 않으면 확인 필요를 얹고 추천에서 뺀다 — 미혼에게 신혼 공고가 나가지 않는다", () => {
    const m = matchAnnouncement({ tracks: [track] }, person({ marriage: "single", children_count: 0, statuses: [] }));
    expect(m.is_match).toBe(false);
    expect(m.status_uncertain).toBe(true);
    expect(m.tracks[0]!.groups.at(-1)!.group.id).toBe("__rank_guard__");
  });

  it("어느 순위엔가 들어가면 그대로 둔다", () => {
    const m = matchAnnouncement({ tracks: [track] }, person({ marriage: "married", marriage_years: 3, children_count: 0, statuses: [] }));
    expect(m.is_match).toBe(true);
    expect(m.tracks[0]!.groups.some((g) => g.group.id === "__rank_guard__")).toBe(false);
  });

  it("앞 순위를 입력이 없어 못 가렸으면 얹지 않는다 — 입력하면 드러난다", () => {
    const m = matchAnnouncement({ tracks: [track] }, person({ marriage: "single", children_count: 0 }));
    expect(m.tracks[0]!.status_guarded).not.toBe(true);
  });

  it("조건 없는 나머지 순위가 있으면 걸리지 않는다", () => {
    const withRest = { ...track, priority_ranks: [...ranksOnly, rank(4, "그 외")] };
    expect(rankGuard(matchAnnouncement({ tracks: [withRest] }, person({ marriage: "single", children_count: 0, statuses: [] })).tracks[0]!, person({ marriage: "single", children_count: 0, statuses: [] })).status_guarded).not.toBe(true);
  });
});
