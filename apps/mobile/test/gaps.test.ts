import { describe, expect, it } from "vitest";
import { matchAnnouncement } from "@housing/engine";
import type { EligibilityRule, SupplyTrack, UserProfile } from "@housing/schema";
import { gapsFor, topGap } from "../src/lib/gaps";

const rule = (category: EligibilityRule["category"], value: number, unit?: string): EligibilityRule =>
  ({ group_id: "basic", applies_to: {}, category, operator: "lte", value, unit, source: { page: 1, text: "공고문" }, confidence: 1, verified: true }) as EligibilityRule;

const track = (rules: EligibilityRule[]): SupplyTrack =>
  ({
    name: "일반",
    unit_types: [],
    rule_groups: [{ id: "basic", mode: "all_of", label: "기본" }],
    rules: [rule("income", 9_000_000, "KRW_monthly"), ...rules],
    pricing: [{ unit_type: "36", kind: "rental", deposit: 10_000_000, monthly_rent: 100_000, source: { page: 1, text: "공고문" } }],
  }) as SupplyTrack;

/** 온보딩 필수 7개만 넣은 사람 — 자동차·청약통장은 비어 있다 */
const minimal = {
  region_code: "11", birth_date: "1996-05-10", age: 30, marriage: "single", household_size: 1,
  monthly_income: 3_000_000, total_assets: 50_000_000, is_homeless: true,
} as UserProfile;

const row = (id: string, rules: EligibilityRule[], region = "11") => ({
  announcement: { id },
  match: matchAnnouncement({ tracks: [track(rules)] }, minimal, { announcement_region: region }),
});

describe("gapsFor", () => {
  it("빈칸마다 판별이 막힌 공고 수를 센다", () => {
    const rows = [
      row("a", [rule("car_value", 37_000_000, "KRW")]),
      row("b", [rule("car_value", 37_000_000, "KRW")]),
      row("c", [rule("subscription", 6, "months")]),
    ];
    expect(gapsFor(rows, minimal)).toEqual([
      { stepId: "car_value", announcements: 2 },
      { stepId: "subscription_months", announcements: 1 },
    ]);
  });

  it("한 공고에서 같은 빈칸이 조건 여럿을 막아도 공고는 한 번만 센다 — 얻는 것은 공고 N개다", () => {
    const rows = [row("a", [rule("car_value", 37_000_000, "KRW"), rule("car_value", 40_000_000, "KRW")])];
    expect(gapsFor(rows, minimal)).toEqual([{ stepId: "car_value", announcements: 1 }]);
  });

  it("다른 지역이라 판단을 미룬 공고는 세지 않는다 — 넣어도 안 바뀌는 것을 약속하면 안 된다", () => {
    // 부산(26) 공고에 거주 요건이 없어서 region_uncertain이 된다
    const rows = [row("far", [rule("car_value", 37_000_000, "KRW")], "26"), row("near", [rule("car_value", 37_000_000, "KRW")])];
    expect(gapsFor(rows, minimal)).toEqual([{ stepId: "car_value", announcements: 1 }]);
  });

  it("이미 다른 조건에서 안 맞는 공고는 세지 않는다 — 넣어도 결과가 그대로다", () => {
    // 소득 상한 100만 원: 월 300만 원인 사람은 이미 어긋난다. 자동차 가액을 넣어도 달라지지 않는다.
    const out = { announcement: { id: "out" }, match: matchAnnouncement({ tracks: [{ ...track([rule("car_value", 37_000_000, "KRW")]), rules: [rule("income", 1_000_000, "KRW_monthly"), rule("car_value", 37_000_000, "KRW")] } as SupplyTrack] }, minimal, { announcement_region: "11" }) };
    expect(gapsFor([out, row("in", [rule("car_value", 37_000_000, "KRW")])], minimal)).toEqual([{ stepId: "car_value", announcements: 1 }]);
  });

  it("이미 넣은 값은 빈칸이 아니다", () => {
    const withCar = { ...minimal, car_value: 0 } as UserProfile;
    const rows = [{ announcement: { id: "a" }, match: matchAnnouncement({ tracks: [track([rule("car_value", 37_000_000, "KRW")])] }, withCar, { announcement_region: "11" }) }];
    expect(gapsFor(rows, withCar)).toEqual([]);
  });

  it("프로필이 없으면 권할 것도 없다", () => {
    expect(gapsFor([row("a", [rule("car_value", 1, "KRW")])], null)).toEqual([]);
  });
});

describe("topGap", () => {
  it("가장 많이 푸는 하나를 고른다", () => {
    const rows = ["a", "b", "c"].map((id) => row(id, [rule("car_value", 37_000_000, "KRW")]));
    expect(topGap(rows, minimal)).toEqual({ stepId: "car_value", announcements: 3 });
  });

  it("공고 하나만 푸는 빈칸은 홈에서 권하지 않는다 — 그건 그 공고의 조건 줄로 충분하다", () => {
    expect(topGap([row("a", [rule("car_value", 37_000_000, "KRW")])], minimal)).toBeNull();
  });
});
