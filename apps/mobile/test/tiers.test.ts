import { describe, expect, it } from "vitest";
import type { Pricing, UserProfile } from "@housing/schema";
import { isIncomeBracket, preferredRow, tierFit } from "../src/lib/tiers";

const row = (unit_type: string, tier: string, monthly_rent: number, trackName = "일반공급 1순위") => ({
  trackName,
  pricing: { unit_type, tier, kind: "rental", deposit: 1_000_000, monthly_rent, source: { page: 1, text: "" } } as Pricing,
});
const worker = { annual_income: 36_000_000, statuses: [] } as unknown as UserProfile;
const recipient = { annual_income: 0, statuses: ["basic_livelihood"] } as unknown as UserProfile;

describe("preferredRow", () => {
  it("수급자가 아니면 '수급자 외' 행을 고른다 — 첫 행(수급자 요율)이 기본이던 것", () => {
    const rows = [row("26㎡", "수급자", 54_920), row("26㎡", "수급자 외", 71_000), row("31㎡", "수급자", 60_000)];
    expect(preferredRow(rows, worker)).toBe(1);
    expect(preferredRow(rows, recipient)).toBe(0);
  });

  it("가군/나군도 같다", () => {
    const rows = [row("A", "가군(생계·의료급여수급자 등)", 40_000), row("A", "나군(일반 등)", 90_000)];
    expect(preferredRow(rows, worker)).toBe(1);
    expect(preferredRow(rows, recipient)).toBe(0);
  });

  it("소득 있음/없음은 연소득으로", () => {
    const rows = [row("17A", "청년(소득 없음)", 100_000), row("17A", "청년(소득 있음)", 120_000)];
    expect(preferredRow(rows, worker)).toBe(1);
    expect(preferredRow(rows, { annual_income: 0 } as UserProfile)).toBe(0);
  });

  it("중위소득 구간은 가를 수 없으니 가장 비싼 행 — 낮게 보여 주는 실수가 더 나쁘다", () => {
    const rows = [row("59A", "1구간(기준 중위소득 30% 이하)", 150_000), row("59A", "6구간(기타소득구간 포함)", 420_000), row("59A", "3구간(기준 중위소득 70% 이하)", 260_000)];
    expect(preferredRow(rows, worker)).toBe(1);
    expect(isIncomeBracket(rows[1]!.pricing.tier)).toBe(true);
  });

  it("다른 주택형·다른 공급 유형으로 건너가지 않는다 — 비싼 것만 보면 가장 넓은 집이 기본이 된다", () => {
    const rows = [row("26㎡", "", 50_000), row("46㎡", "", 200_000), row("26㎡", "", 60_000, "다른 트랙")];
    expect(preferredRow(rows, worker)).toBe(0);
  });

  it("계층을 모르면 수급자 행을 고르지 않는다", () => {
    expect(tierFit("수급자", {} as UserProfile)).toBeLessThan(tierFit("수급자 외", {} as UserProfile));
  });
});
