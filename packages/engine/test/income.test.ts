import { describe, expect, it } from "vitest";
import { HEALTH_INSURANCE, incomeFromPremium, premiumFromIncome } from "../src/index";

describe("incomeFromPremium", () => {
  it("보수월액 = 본인부담 건보료 ÷ (요율/2)", () => {
    // 보수월액 300만 원 → 본인부담 300만 × 7.19% ÷ 2 = 107,850원
    const r = incomeFromPremium({ premium: 107_850 });
    expect(r.monthly_income).toBe(3_000_000);
    expect(r.employee_rate).toBeCloseTo(HEALTH_INSURANCE.rate / 2, 6);
    expect(r.as_of).toBe(HEALTH_INSURANCE.as_of);
  });

  it("맞벌이는 두 사람 소득을 더한다", () => {
    const r = incomeFromPremium({ premium: 107_850, spouse_premium: 71_900 });
    expect(r.parts).toHaveLength(2);
    expect(r.parts[1]!.monthly_income).toBe(2_000_000);
    expect(r.monthly_income).toBe(5_000_000);
  });

  it("0 이하는 0, 결과는 1,000원 단위", () => {
    expect(incomeFromPremium({ premium: 0 }).monthly_income).toBe(0);
    expect(incomeFromPremium({ premium: 123_456 }).monthly_income % 1000).toBe(0);
  });

  it("premiumFromIncome 은 역함수 (반올림 오차 이내)", () => {
    const income = 4_166_667;
    const back = incomeFromPremium({ premium: premiumFromIncome(income) }).monthly_income;
    expect(Math.abs(back - income)).toBeLessThan(1000);
  });
});
