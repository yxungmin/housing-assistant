import { describe, expect, it } from "vitest";
import type { UserProfile } from "@housing/schema";
import { applies, compare, matchAnnouncement, matchTrack } from "../src/index";
import { marriedDualProfile, newlywedTrack, youthTrack } from "./fixtures";

describe("compare", () => {
  it("handles every operator", () => {
    expect(compare(5, "lte", 5)).toBe(true);
    expect(compare(6, "lte", 5)).toBe(false);
    expect(compare(5, "gte", 5)).toBe(true);
    expect(compare(25, "between", [19, 39])).toBe(true);
    expect(compare(40, "between", [19, 39])).toBe(false);
    expect(compare("single", "in", ["single", "pre_marriage"])).toBe(true);
    expect(compare(true, "is_true", true)).toBe(true);
    expect(compare("11", "eq", "11")).toBe(true);
  });
  it("array actual matches if any element matches", () => {
    expect(compare([9, 4], "lte", 6)).toBe(true);
    expect(compare([9, 8], "lte", 6)).toBe(false);
    expect(compare([], "lte", 6)).toBe(false);
  });
});

describe("applies", () => {
  it("returns null when the profile lacks the discriminating field", () => {
    expect(applies({ household_size: 3 }, {})).toBeNull();
    expect(applies({ household_size: 3 }, { household_size: 4 })).toBe(false);
    expect(applies({ household_size: 3, income_type: "dual" }, { household_size: 3, income_type: "dual" })).toBe(true);
  });
});

describe("matchTrack — newlywed track", () => {
  it("married dual-income 3-person household matches", () => {
    const r = matchTrack(newlywedTrack, marriedDualProfile);
    expect(r.summary).toEqual({ matched: 3, needs_check: 0, mismatched: 0 });
    const income = r.groups.find((g) => g.group.id === "income")!;
    // 외벌이 3인 룰은 applies_to로 건너뛰고, 맞벌이 3인 룰만 집계된다
    expect(income.rules.filter((x) => x.skipped)).toHaveLength(1);
    expect(income.status).toBe("MATCH");
  });

  it("income above the dual cap mismatches", () => {
    const r = matchTrack(newlywedTrack, { ...marriedDualProfile, monthly_income: 9_000_000 });
    expect(r.groups.find((g) => g.group.id === "income")!.status).toBe("MISMATCH");
    expect(r.summary.mismatched).toBe(1);
  });

  it("any_of group passes via children when marriage is too long", () => {
    const r = matchTrack(newlywedTrack, { ...marriedDualProfile, marriage_years: 9, children_ages: [3] });
    expect(r.groups.find((g) => g.group.id === "newlywed")!.status).toBe("MATCH");
  });

  it("any_of group mismatches when no alternative holds", () => {
    const r = matchTrack(newlywedTrack, { ...marriedDualProfile, marriage_years: 9, children_ages: [10] });
    expect(r.groups.find((g) => g.group.id === "newlywed")!.status).toBe("MISMATCH");
  });

  it("missing household_size makes income NEEDS_CHECK, not MISMATCH", () => {
    const { household_size: _omit, ...profile } = marriedDualProfile;
    const r = matchTrack(newlywedTrack, profile as UserProfile);
    expect(r.groups.find((g) => g.group.id === "income")!.status).toBe("NEEDS_CHECK");
    expect(r.summary.mismatched).toBe(0);
  });

  it("homeowner fails the housing rule", () => {
    const r = matchTrack(newlywedTrack, { ...marriedDualProfile, is_homeless: false, homeless_months: undefined });
    expect(r.groups.find((g) => g.group.id === "basic")!.status).toBe("MISMATCH");
  });

  it("검수 전 룰도 그대로 판정한다 (검수 여부는 화면이 알린다)", () => {
    const track = {
      ...newlywedTrack,
      rules: newlywedTrack.rules.map((rule) => ({ ...rule, verified: false })),
    };
    const r = matchTrack(track, marriedDualProfile);
    expect(r.summary).toEqual(matchTrack(newlywedTrack, marriedDualProfile).summary);
    // 판정은 같지만 근거는 남아 있어야 한다 — 화면이 "자동 확인"을 붙일 수 있게
    expect(r.groups.flatMap((g) => g.rules).every((x) => x.rule.verified === false)).toBe(true);
  });

  it("unknown category field in a rule does not crash — treated as NEEDS_CHECK", () => {
    const track = {
      ...youthTrack,
      rules: [
        ...youthTrack.rules,
        // 스키마 진화 대비: 엔진이 모르는 category가 들어와도 죽지 않는다
        { ...youthTrack.rules[0]!, category: "pet_allowed" as never },
      ],
    };
    const r = matchTrack(track, { age: 25, marriage: "single" });
    expect(r.groups[0]!.status).toBe("NEEDS_CHECK");
  });
});

describe("matchAnnouncement", () => {
  it("picks the best track with zero mismatches", () => {
    const m = matchAnnouncement({ tracks: [youthTrack, newlywedTrack] }, marriedDualProfile);
    expect(m.is_match).toBe(true);
    expect(m.best_track!.track.name).toBe("신혼부부·한부모가족");
  });

  it("is_match false when every track has a mismatch", () => {
    const m = matchAnnouncement({ tracks: [youthTrack, newlywedTrack] }, { ...marriedDualProfile, total_assets: 900_000_000 });
    expect(m.is_match).toBe(false);
    expect(m.best_track).toBeNull();
  });

  it("single 25-year-old matches the youth track only", () => {
    const m = matchAnnouncement({ tracks: [youthTrack, newlywedTrack] }, { age: 25, marriage: "single", household_size: 1, income_type: "single" });
    expect(m.best_track!.track.name).toBe("청년");
  });
});

describe("status category (계층 자격)", () => {
  const src = { page: 1, text: "주거급여 수급자" };
  const track = {
    name: "주거급여 수급자 계층",
    unit_types: [],
    rule_groups: [{ id: "basic", mode: "all_of" as const, label: "기본" }],
    rules: [
      { group_id: "basic", category: "status" as const, applies_to: {}, operator: "in" as const, value: ["welfare_recipient", "basic_livelihood"], source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "housing" as const, applies_to: {}, operator: "gte" as const, value: 0, unit: "months", source: src, confidence: 1, verified: true },
    ],
    pricing: [],
  };
  const base: UserProfile = { age: 28, is_homeless: true, homeless_months: 60 };
  it("is NEEDS_CHECK when statuses were never asked", () => {
    expect(matchTrack(track, base).summary).toEqual({ matched: 0, needs_check: 1, mismatched: 0 });
  });
  it("is MISMATCH when the user has no special status (해당 없음)", () => {
    expect(matchTrack(track, { ...base, statuses: [] }).summary.mismatched).toBe(1);
  });
  it("matches when one of the statuses is held", () => {
    expect(matchTrack(track, { ...base, statuses: ["welfare_recipient"] }).summary).toEqual({ matched: 1, needs_check: 0, mismatched: 0 });
  });
});

describe("marriage-years rules for non-married profiles", () => {
  it("single user MISMATCHes '혼인 7년 이내' instead of NEEDS_CHECK (loan eligibility bug)", () => {
    const r = matchTrack(
      { name: "신혼", unit_types: [], rule_groups: [{ id: "g", mode: "all_of", label: "기본" }], rules: [{ group_id: "g", category: "marriage", applies_to: {}, operator: "lte", value: 7, unit: "years", source: { page: 1, text: "혼인 7년 이내" }, confidence: 1, verified: true }], pricing: [] },
      { marriage: "single" },
    );
    expect(r.summary.mismatched).toBe(1);
  });
  it("pre-marriage counts as 0 years (MATCH)", () => {
    const r = matchTrack(
      { name: "신혼", unit_types: [], rule_groups: [{ id: "g", mode: "all_of", label: "기본" }], rules: [{ group_id: "g", category: "marriage", applies_to: {}, operator: "lte", value: 7, unit: "years", source: { page: 1, text: "혼인 7년 이내" }, confidence: 1, verified: true }], pricing: [] },
      { marriage: "pre_marriage" },
    );
    expect(r.summary.matched).toBe(1);
  });
});

describe("ageFromBirthDate", () => {
  it("counts 만 나이 by whether the birthday has passed", async () => {
    const { ageFromBirthDate } = await import("../src/index");
    const today = new Date(2026, 8, 20); // 2026-09-20
    expect(ageFromBirthDate("1998-03-15", today)).toBe(28);
    expect(ageFromBirthDate("1998-09-20", today)).toBe(28);
    expect(ageFromBirthDate("1998-09-21", today)).toBe(27);
    expect(ageFromBirthDate("2026-12-01", today)).toBe(0);
  });
});

describe("residence with 시군구 and subscription auto-increment", () => {
  const src = { page: 1, text: "x" };
  const mk = (category: "residence" | "subscription", value: unknown, unit?: string) => ({
    name: "t", unit_types: [], rule_groups: [{ id: "g", mode: "all_of" as const, label: "기본" }],
    rules: [{ group_id: "g", category, applies_to: {}, operator: (category === "residence" ? "in" : "gte") as "in" | "gte", value: value as never, unit, source: src, confidence: 1, verified: true }], pricing: [],
  });
  it("matches a 시군구 rule when the profile lives there, and mismatches another 시군구", () => {
    const p: UserProfile = { region_code: "41", region_sigungu: "경기 과천시" };
    expect(matchTrack(mk("residence", ["경기 과천시"]), p).summary.matched).toBe(1);
    expect(matchTrack(mk("residence", ["41"]), p).summary.matched).toBe(1);
    expect(matchTrack(mk("residence", ["경기 안양시"]), p).summary.mismatched).toBe(1);
  });
  it("adds elapsed months to subscription when still paying", async () => {
    const { profileValueFor } = await import("../src/index");
    const today = new Date(2026, 8, 20);
    const p: UserProfile = { subscription_months: 24, subscription_deposits: 24, subscription_as_of: "2026-03-05", subscription_active: true };
    expect(profileValueFor("subscription", p, undefined, today)).toBe(30);
    expect(profileValueFor("subscription", p, "count", today)).toBe(30);
    expect(profileValueFor("subscription", { ...p, subscription_active: false }, undefined, today)).toBe(24);
  });
});

/**
 * 거주 요건 안전망. 실제로 새어 나간 버그를 막는 자리라 테스트를 붙여 둔다 —
 * 제주 행복주택 공고에서 거주지 룰이 통째로 빠져, 서울 사는 사람에게 "조건 7개 중 7개 일치"로 떴다.
 */
describe("regionGuard", () => {
  const seoul: UserProfile = { ...marriedDualProfile, age: 30, marriage: "single", region_code: "11" };

  it("거주지 룰이 없고 공고 지역이 다르면 확인 필요를 하나 얹는다", () => {
    const plain = matchAnnouncement({ tracks: [youthTrack] }, seoul);
    const guarded = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "50" });
    expect(guarded.tracks[0]!.summary.needs_check).toBe(plain.tracks[0]!.summary.needs_check + 1);
    expect(guarded.tracks[0]!.groups.map((g) => g.group.label)).toContain("거주 요건");
  });

  it("수도권은 한 생활권으로 본다 — 서울 사람에게 과천 공고를 감추지 않는다", () => {
    const gyeonggi = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "41" });
    expect(gyeonggi.tracks[0]!.groups.map((g) => g.group.label)).not.toContain("거주 요건");
    expect(gyeonggi.is_match).toBe(true);
    const incheon = matchAnnouncement({ tracks: [youthTrack] }, { ...seoul, region_code: "28" }, { announcement_region: "41" });
    expect(incheon.is_match).toBe(true);
  });

  it("MISMATCH로 잘라내지 않는다 — 전국 모집이면 자격이 되는 사람에게서 공고를 감추게 된다", () => {
    const guarded = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "50" });
    expect(guarded.tracks[0]!.summary.mismatched).toBe(0);
    // 상세 화면이 조건을 다 보여 줄 수 있게 트랙은 남는다
    expect(guarded.best_track).not.toBeNull();
  });

  it("\"조건에 맞는 공고\"로는 세지 않는다 — 어긋난 게 없다는 것과 맞는다는 것은 다른 말이다", () => {
    const guarded = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "50" });
    expect(guarded.is_match).toBe(false);
    expect(guarded.region_uncertain).toBe(true);
  });

  it("같은 지역이면 평소대로 맞는 공고다", () => {
    const here = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "11" });
    expect(here.is_match).toBe(true);
    expect(here.region_uncertain).toBe(false);
  });

  it("공고 지역이 내 지역이면 건드리지 않는다", () => {
    const guarded = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "11" });
    expect(guarded.tracks[0]!.summary.needs_check).toBe(matchAnnouncement({ tracks: [youthTrack] }, seoul).tracks[0]!.summary.needs_check);
  });

  it("공고 지역을 모르거나 사는 곳을 모르면 건드리지 않는다", () => {
    const noRegion: UserProfile = { ...seoul, region_code: undefined };
    expect(matchAnnouncement({ tracks: [youthTrack] }, noRegion, { announcement_region: "50" }).tracks[0]!.summary.needs_check).toBe(
      matchAnnouncement({ tracks: [youthTrack] }, noRegion).tracks[0]!.summary.needs_check,
    );
    expect(matchAnnouncement({ tracks: [youthTrack] }, seoul, {}).tracks[0]!.summary.needs_check).toBe(
      matchAnnouncement({ tracks: [youthTrack] }, seoul).tracks[0]!.summary.needs_check,
    );
  });

  it("공고문에서 거주 요건을 읽었으면 그 판정을 그대로 믿는다", () => {
    const withResidence = {
      ...youthTrack,
      rules: [
        ...youthTrack.rules,
        {
          group_id: "basic",
          applies_to: {},
          category: "residence" as const,
          operator: "in" as const,
          value: ["11", "50"],
          unit: "region_code",
          source: { page: 3, text: "제주특별자치도 또는 서울특별시 거주자" },
          confidence: 0.95,
          verified: true,
        },
      ],
    };
    const guarded = matchAnnouncement({ tracks: [withResidence] }, seoul, { announcement_region: "50" });
    expect(guarded.tracks[0]!.groups.some((g) => g.group.label === "거주 요건")).toBe(false);
  });
});

/**
 * 소득 안전망. 실제로 새어 나간 버그를 막는 자리라 테스트를 붙여 둔다 —
 * 강서염창 우선공급 트랙의 규칙이 「무주택세대구성원」 하나뿐이라,
 * 자산 9억 원 가구에게도 "조건 1개 중 1개 일치"라는 완벽한 태그가 붙었다.
 */
describe("incomeGuard", () => {
  const seoul: UserProfile = { ...marriedDualProfile, age: 30, marriage: "single", region_code: "11" };

  it("소득 규칙이 없는 임대 트랙에 확인 필요를 한 줄 얹는다", () => {
    const m = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "11" });
    expect(m.tracks[0]!.groups.map((g) => g.group.id)).toContain("__income_guard__");
  });

  it("후보에서 빼지는 않는다 — 소득 상한은 사람마다 갈려서 모두에게 감출 일이 아니다", () => {
    const m = matchAnnouncement({ tracks: [youthTrack] }, seoul, { announcement_region: "11" });
    expect(m.is_match).toBe(true);
    expect(m.tracks[0]!.summary.mismatched).toBe(0);
  });

  it("소득 규칙을 읽은 트랙은 건드리지 않는다", () => {
    // newlywedTrack에는 진짜 "소득 기준" 그룹이 있다. 안전망이 붙었는지는 id로 본다.
    const m = matchAnnouncement({ tracks: [newlywedTrack] }, { ...marriedDualProfile, region_code: "11" }, { announcement_region: "11" });
    expect(m.tracks[0]!.groups.map((g) => g.group.id)).not.toContain("__income_guard__");
  });
});
