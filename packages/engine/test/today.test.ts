import { describe, expect, it } from "vitest";
import type { EligibilityRule, UserProfile } from "@housing/schema";
import { matchAnnouncement } from "../src/index";

/**
 * 나이·혼인 기간은 "오늘"에 달렸다. 기준 날짜를 밖에서 주면 같은 입력에 같은 결과가 나온다 —
 * 엔진 안에서 new Date()를 부르면 날이 바뀔 때 결과가 조용히 바뀌고, 테스트는 실제 시계에 매인다 (2026-09-24 감사).
 */
const ageRule: EligibilityRule = {
  group_id: "g", category: "age", applies_to: {}, operator: "lte", value: 39, unit: "years",
  source: { page: 1, text: "만 19세 이상 39세 이하" }, confidence: 1, verified: false,
};
const extraction = { tracks: [{ name: "청년", unit_types: [], rule_groups: [{ id: "g", mode: "all_of" as const, label: "나이" }], rules: [ageRule], pricing: [] }] };
const profile = { region_code: "11", birth_date: "1996-03-15", is_homeless: true } as UserProfile;

describe("MatchOptions.today", () => {
  it("기준 날짜에 따라 나이 판정이 갈리고, 같은 날짜면 결과가 같다", () => {
    const young = matchAnnouncement(extraction, profile, { today: new Date("2026-01-01") }); // 만 29세
    const older = matchAnnouncement(extraction, profile, { today: new Date("2036-06-01") }); // 만 40세
    expect(young.tracks[0]!.groups[0]!.rules[0]!.status).toBe("MATCH");
    expect(older.tracks[0]!.groups[0]!.rules[0]!.status).toBe("MISMATCH");
    expect(matchAnnouncement(extraction, profile, { today: new Date("2026-01-01") })).toEqual(young);
  });

  it("안 주면 지금 기준 — 호출부가 바꾸지 않아도 동작은 같다", () => {
    expect(matchAnnouncement(extraction, profile).tracks[0]!.groups[0]!.rules[0]!.status).toBe("MATCH");
  });
});
