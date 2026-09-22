/**
 * 부족액을 더 빌렸을 때 월 부담이 어떻게 되는가.
 *
 * 여기서 말하는 부족액은 이미 공공 저리 대출(버팀목 등)을 다 쓰고도 모자라는 돈이다.
 * 그걸 메우려면 대부분 신용대출이고, 금리가 한 자릿수 후반에서 두 자릿수까지 간다.
 *
 * **상품을 추천하지 않는다.** 공공임대 대상은 소득·자산 기준에 걸린 사람들이고,
 * 그 사람들에게 "이 대출을 쓰세요"라고 말하는 것은 감당 못 할 위험이 가장 큰 쪽에
 * 가장 비싼 돈을 권하는 일이 된다. 우리가 할 수 있는 정직한 일은 계산이다 —
 * "그렇게 하면 월에 얼마가 되고 소득의 몇 %가 된다". 판단은 사람이 한다.
 *
 * 많은 경우 이 표가 답을 준다. 42%가 나오면 사용자가 스스로 안다.
 */

/** 신용대출 금리는 사람마다 다르다. 낮게 잡아 안심시키지 않도록 넓게 벌려 보여 준다. */
export const SHORTFALL_RATES = [0.05, 0.08, 0.12] as const;

/** 원리금균등 5년. 이자만 내는 방식이면 월 부담은 적지만 원금이 그대로 남는다 */
export const SHORTFALL_TERM_MONTHS = 60;

/** 월 주거비가 소득에서 이 비율을 넘으면 부담이 크다고 본다 (주거비 과부담 기준으로 흔히 쓰는 선) */
export const BURDEN_WARN_RATIO = 0.3;

export interface ShortfallPlan {
  annual_rate: number;
  /** 매달 더 나가는 돈 (원리금균등) */
  monthly_payment: number;
  /** 기존 월 주거비 + 이 상환액 */
  monthly_total: number;
  /** 소득 대비 비율. 소득을 모르면 null */
  income_ratio: number | null;
  /** 소득의 30%를 넘는가 */
  heavy: boolean;
}

import { pmt } from "./cost";

/**
 * 부족액을 금리별로 갚았을 때의 월 부담.
 * 부족액이 없거나 0이면 빈 배열 — 화면이 이 자리를 통째로 숨긴다.
 */
export function shortfallPlans(input: {
  shortfall: number;
  /** 지금 계산된 월 주거비 (월임대료 + 기존 대출 상환 + 관리비) */
  monthlyHousingCost: number;
  monthlyIncome?: number;
  rates?: readonly number[];
  termMonths?: number;
}): ShortfallPlan[] {
  const { shortfall, monthlyHousingCost, monthlyIncome } = input;
  if (shortfall <= 0) return [];
  const term = input.termMonths ?? SHORTFALL_TERM_MONTHS;

  return (input.rates ?? SHORTFALL_RATES).map((annual_rate) => {
    const monthly_payment = Math.round(pmt(shortfall, annual_rate, term));
    const monthly_total = monthlyHousingCost + monthly_payment;
    const income_ratio = monthlyIncome && monthlyIncome > 0 ? monthly_total / monthlyIncome : null;
    return {
      annual_rate,
      monthly_payment,
      monthly_total,
      income_ratio,
      heavy: income_ratio !== null && income_ratio > BURDEN_WARN_RATIO,
    };
  });
}
