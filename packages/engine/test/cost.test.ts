import { describe, expect, it } from "vitest";
import { computeRentalCost, conversionScenario, eligibleLoans, loanLimit, pmt } from "../src/index";
import { buteomok, marriedDualProfile, newlywedTrack } from "./fixtures";

describe("pmt", () => {
  it("matches the standard amortization formula", () => {
    // 1억, 연 3%, 30년 → 약 421,604원
    expect(Math.round(pmt(100_000_000, 0.03, 360))).toBe(421_604);
    expect(pmt(0, 0.03, 360)).toBe(0);
    expect(pmt(1_200_000, 0, 12)).toBe(100_000);
  });
});

describe("loans", () => {
  it("filters eligibility with the same rule engine", () => {
    expect(eligibleLoans([buteomok], marriedDualProfile)).toHaveLength(0); // 월 800만 > 750만
    expect(eligibleLoans([buteomok], { ...marriedDualProfile, monthly_income: 6_000_000 })).toHaveLength(1);
  });

  it("limit = min(product cap, deposit × ltv) and rate from the tier table", () => {
    const q = loanLimit(buteomok, 60_000_000, { ...marriedDualProfile, monthly_income: 6_000_000 });
    expect(q.amount).toBe(48_000_000);
    expect(q.annual_rate).toBe(0.027);
    expect(q.monthly_payment).toBe(108_000); // 이자만: 4,800만 × 2.7% / 12
  });

  it("applies DSR only when the product declares it", () => {
    const withDsr = { ...buteomok, dsr_limit: 0.4, interest_only: false, term_months: 120 };
    const q = loanLimit(withDsr, 300_000_000, { ...marriedDualProfile, monthly_income: 1_000_000 });
    expect(q.amount).toBeLessThan(240_000_000);
    expect(q.amount).toBeGreaterThan(0);
  });
});

describe("computeRentalCost", () => {
  const pricing = newlywedTrack.pricing[0]!;

  it("breaks down cash, shortfall and monthly cost with a loan", () => {
    const profile = { ...marriedDualProfile, monthly_income: 6_000_000, cash_on_hand: 5_000_000 };
    const c = computeRentalCost(pricing, [buteomok], profile);
    expect(c.loan?.amount).toBe(48_000_000);
    expect(c.required_cash).toBe(12_000_000);
    expect(c.shortfall).toBe(7_000_000);
    expect(c.maintenance_estimate).toBe(100_000); // 공고문에 없어 기본값
    expect(c.monthly_housing_cost).toBe(280_000 + 108_000 + 100_000);
    expect(c.income_ratio).toBeCloseTo(488_000 / 6_000_000, 6);
    expect(c.sources.some((s) => s.label === "대출" && s.detail.includes("2026-09-01"))).toBe(true);
  });

  it("without an eligible loan the whole deposit is required cash", () => {
    const c = computeRentalCost(pricing, [buteomok], marriedDualProfile);
    expect(c.loan).toBeNull();
    expect(c.required_cash).toBe(60_000_000);
    expect(c.shortfall).toBe(30_000_000);
  });

  it("adds existing debt to the income ratio", () => {
    const c = computeRentalCost(pricing, [], { ...marriedDualProfile, monthly_debt_payment: 500_000 });
    expect(c.income_ratio).toBeCloseTo((280_000 + 100_000 + 500_000) / 8_000_000, 6);
  });

  it("refuses sale pricing in V0.1", () => {
    expect(() =>
      computeRentalCost({ unit_type: "59", kind: "sale", sale_price: 1, source: { page: 1, text: "x" } }, [], {}),
    ).toThrow();
  });
});

describe("conversionScenario", () => {
  const pricing = newlywedTrack.pricing[0]!;
  it("raising the deposit lowers rent by rate/12", () => {
    const s = conversionScenario(pricing, 80_000_000);
    expect(s.deposit).toBe(80_000_000);
    expect(s.monthly_rent).toBe(280_000 - 100_000); // 2,000만 × 6% / 12
  });
  it("clamps to max_deposit and never goes below the base deposit", () => {
    expect(conversionScenario(pricing, 500_000_000).deposit).toBe(110_000_000);
    expect(conversionScenario(pricing, 1).deposit).toBe(60_000_000);
  });
  it("lowering the deposit uses rate_down (과천 S-11BL: 증액 7%, 감액 3.5%)", () => {
    const p = {
      ...pricing,
      deposit: 57_120_000,
      monthly_rent: 204_680,
      conversion: { rate: 0.07, rate_down: 0.035, min_deposit: 48_000_000, max_deposit: 78_120_000 },
    };
    // 공고문 표: 최대 증액 시 78,120,000 / 82,180원, 최대 감액 시 48,000,000 / 231,280원 (반올림 차이 허용)
    const up = conversionScenario(p, 78_120_000);
    expect(up.deposit).toBe(78_120_000);
    expect(Math.abs(up.monthly_rent - 82_180)).toBeLessThanOrEqual(10);
    const down = conversionScenario(p, 40_000_000);
    expect(down.deposit).toBe(48_000_000); // 하한으로 잘림
    expect(Math.abs(down.monthly_rent - 231_280)).toBeLessThanOrEqual(10);
  });
  it("rent never goes negative", () => {
    const p = { ...pricing, conversion: { rate: 0.06, max_deposit: 1_000_000_000 } };
    expect(conversionScenario(p, 1_000_000_000).monthly_rent).toBe(0);
  });
});
