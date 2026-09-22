import { describe, expect, it } from "vitest";
import { matchAnnouncement, missingCategories, siblingGuard } from "../src";
import type { EligibilityRule, ExtractionOutput, RuleCategory, UserProfile } from "@housing/schema";

const rule = (category: RuleCategory): EligibilityRule => ({
  group_id: "g1",
  category,
  applies_to: {},
  operator: "gte",
  value: 0,
  source: { page: 1, text: "x" },
  confidence: 1,
  verified: false,
});

const track = (name: string, cats: RuleCategory[]) => ({
  name,
  unit_types: [],
  rule_groups: [{ id: "g1", mode: "all_of" as const, label: "자격" }],
  rules: cats.map(rule),
  pricing: [],
});

/**
 * 이 검사가 있는 이유: 지금 구조에서는 조건이 빠지면 조용히 통과가 된다.
 * 룰이 없으면 평가되지 않고, 평가되지 않으면 걸리지 않는다 —
 * 즉 추출이 실패할수록 사용자에게는 "더 잘 맞는 공고"로 보인다. 방향이 거꾸로다.
 */
describe("빠진 조건 찾기", () => {
  it("형제 대부분이 가진 조건이 한 트랙에만 없으면 집어낸다", () => {
    const x = {
      tracks: [
        track("A", ["housing", "subscription"]),
        track("B", ["housing", "subscription"]),
        track("C", ["housing"]),
      ],
    } as unknown as ExtractionOutput;
    expect(missingCategories(x)).toEqual([[], [], ["subscription"]]);
  });

  it("드물게 있는 조건은 누락으로 보지 않는다 — 특칙일 수 있다", () => {
    const x = {
      tracks: [track("A", ["housing", "children"]), track("B", ["housing"]), track("C", ["housing"])],
    } as unknown as ExtractionOutput;
    expect(missingCategories(x).flat()).toEqual([]);
  });

  it("소득·거주는 전용 안전망이 따로 있어 여기서 또 잡지 않는다 — 같은 말을 두 번 읽게 된다", () => {
    const x = {
      tracks: [track("A", ["income", "residence"]), track("B", ["income", "residence"]), track("C", [])],
    } as unknown as ExtractionOutput;
    expect(missingCategories(x)[2]).toEqual([]);
  });

  it("트랙이 셋보다 적으면 비교할 근거가 없다", () => {
    const x = { tracks: [track("A", ["subscription"]), track("B", [])] } as unknown as ExtractionOutput;
    expect(missingCategories(x).flat()).toEqual([]);
  });
});

describe("siblingGuard", () => {
  const base = {
    track: track("A", ["housing"]),
    groups: [],
    summary: { matched: 3, mismatched: 0, needs_check: 0 },
  } as never;

  it("빠진 것이 없으면 트랙을 그대로 둔다", () => {
    expect(siblingGuard(base, [])).toBe(base);
  });

  it("빠진 조건마다 '확인 필요'를 하나씩 얹는다 — 완벽해 보이지 않게", () => {
    const out = siblingGuard(base, ["subscription", "age"]);
    expect(out.summary.needs_check).toBe(2);
    expect(out.groups).toHaveLength(2);
    expect(out.groups.every((g) => g.status === "NEEDS_CHECK")).toBe(true);
  });

  it("사람이 읽을 이유를 적는다 — 원시 카테고리명이 화면에 나가면 안 된다", () => {
    const [g] = siblingGuard(base, ["subscription"]).groups;
    expect(g!.group.label).toBe("청약통장 요건");
    expect(g!.rules[0]!.reason).toContain("청약통장 요건");
    expect(g!.rules[0]!.reason).not.toContain("subscription");
  });

  it("어긋남으로 세지 않는다 — 모르는 것은 틀린 것이 아니다", () => {
    expect(siblingGuard(base, ["subscription"]).summary.mismatched).toBe(0);
  });
});

describe("판정에 실제로 반영된다", () => {
  const profile = { region_code: "11", is_homeless: true } as UserProfile;
  const extraction = {
    tracks: [
      track("A", ["housing", "subscription"]),
      track("B", ["housing", "subscription"]),
      track("C", ["housing"]),
    ],
  } as unknown as ExtractionOutput;

  it("조건을 못 읽은 트랙은 '전부 일치'가 되지 않는다", () => {
    const m = matchAnnouncement(extraction, profile);
    const c = m.tracks[2]!;
    expect(c.summary.needs_check).toBeGreaterThan(0);
  });

  it("후보에서 빼지는 않는다 — 감추면 그 오류는 아무도 신고하지 못한다", () => {
    const m = matchAnnouncement(extraction, profile);
    expect(m.tracks).toHaveLength(3);
  });
});
