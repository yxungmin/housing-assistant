import { describe, expect, it } from "vitest";
import { BURDEN_WARN_RATIO, SHORTFALL_RATES, shortfallPlans } from "../src/shortfall";

describe("shortfallPlans", () => {
  const base = { shortfall: 100_000_000, monthlyHousingCost: 570_000, monthlyIncome: 3_200_000 };

  it("부족액이 없으면 아무것도 계산하지 않는다 — 화면이 이 자리를 숨긴다", () => {
    expect(shortfallPlans({ ...base, shortfall: 0 })).toEqual([]);
    expect(shortfallPlans({ ...base, shortfall: -1 })).toEqual([]);
  });

  it("금리마다 한 줄씩 준다", () => {
    expect(shortfallPlans(base).map((p) => p.annual_rate)).toEqual([...SHORTFALL_RATES]);
  });

  it("금리가 높으면 월 상환도 많다", () => {
    const [low, mid, high] = shortfallPlans(base);
    expect(low!.monthly_payment).toBeLessThan(mid!.monthly_payment);
    expect(mid!.monthly_payment).toBeLessThan(high!.monthly_payment);
  });

  it("1억을 연 5% 5년 원리금균등으로 갚으면 월 약 189만 원", () => {
    const [low] = shortfallPlans(base);
    expect(low!.monthly_payment).toBeGreaterThan(1_850_000);
    expect(low!.monthly_payment).toBeLessThan(1_910_000);
  });

  it("월 주거비에 상환액을 더해 합계를 낸다 — 사람이 실제로 내는 돈이 그것이다", () => {
    const [low] = shortfallPlans(base);
    expect(low!.monthly_total).toBe(base.monthlyHousingCost + low!.monthly_payment);
  });

  it("소득의 30%를 넘으면 부담이 크다고 표시한다", () => {
    const [low] = shortfallPlans(base);
    expect(low!.income_ratio).toBeGreaterThan(BURDEN_WARN_RATIO);
    expect(low!.heavy).toBe(true);
  });

  it("감당되는 경우에는 표시하지 않는다", () => {
    const [low] = shortfallPlans({ shortfall: 10_000_000, monthlyHousingCost: 400_000, monthlyIncome: 6_000_000 });
    expect(low!.heavy).toBe(false);
  });

  it("소득을 모르면 비율을 지어내지 않는다", () => {
    const [low] = shortfallPlans({ ...base, monthlyIncome: undefined });
    expect(low!.income_ratio).toBeNull();
    expect(low!.heavy).toBe(false);
  });

  it("소득이 0이어도 나누지 않는다", () => {
    expect(shortfallPlans({ ...base, monthlyIncome: 0 })[0]!.income_ratio).toBeNull();
  });

  it("기간을 늘리면 월 상환이 줄어든다 — 총 이자는 늘지만 그건 화면이 말한다", () => {
    const five = shortfallPlans(base)[0]!;
    const ten = shortfallPlans({ ...base, termMonths: 120 })[0]!;
    expect(ten.monthly_payment).toBeLessThan(five.monthly_payment);
  });
});
