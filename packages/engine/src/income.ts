/**
 * 건강보험료 → 월 소득 역산 (소득 입력 도우미).
 * 직장가입자의 보수월액 보험료는 보수월액 × 보험료율이고 본인과 회사가 절반씩 낸다.
 * 그래서 급여명세서의 "건강보험료" 본인부담액 ÷ (보험료율 ÷ 2) 가 세전 보수월액이다.
 * 장기요양보험료는 별도 항목이므로 더하지 말라고 안내한다. 지역가입자는 점수제라 역산할 수 없다.
 *
 * 공고문의 소득 기준표도 같은 방식(보수월액 × 보험료율 ÷ 2)으로 건강보험료 기준액을 적는다.
 * 요율이 바뀌면 여기 한 곳과 AS_OF 를 같이 고친다.
 */
export const HEALTH_INSURANCE = {
  /** 건강보험료율 (보수월액 대비, 회사분 포함). 2026년 적용 7.19% */
  rate: 0.0719,
  /** 근로자 본인 부담 비율 */
  employee_share: 0.5,
  /** 요율 기준 연도 */
  year: 2026,
  as_of: "2026-01-01",
  source: "보건복지부 건강보험정책심의위원회 2026년 건강보험료율 결정 (2025-08)",
} as const;

export interface IncomeFromPremiumInput {
  /** 본인 월 건강보험료 (장기요양보험료 제외, 원) */
  premium: number;
  /** 배우자 월 건강보험료 (맞벌이일 때, 원) */
  spouse_premium?: number;
}

export interface IncomeFromPremiumResult {
  /** 세전 가구 월소득 추정 (원, 1,000원 단위 반올림) */
  monthly_income: number;
  /** 본인·배우자 각각 */
  parts: { premium: number; monthly_income: number }[];
  rate: number;
  employee_rate: number;
  as_of: string;
}

/** 본인 부담 건강보험료로 세전 보수월액을 역산한다. */
export function incomeFromPremium(input: IncomeFromPremiumInput): IncomeFromPremiumResult {
  const employeeRate = HEALTH_INSURANCE.rate * HEALTH_INSURANCE.employee_share;
  const toIncome = (premium: number) => (premium <= 0 ? 0 : Math.round(premium / employeeRate / 1000) * 1000);
  const parts = [input.premium, ...(input.spouse_premium !== undefined ? [input.spouse_premium] : [])].map((p) => ({ premium: p, monthly_income: toIncome(p) }));
  return {
    monthly_income: parts.reduce((s, p) => s + p.monthly_income, 0),
    parts,
    rate: HEALTH_INSURANCE.rate,
    employee_rate: employeeRate,
    as_of: HEALTH_INSURANCE.as_of,
  };
}

/** 반대 방향: 소득 기준액(원)을 건강보험료 본인부담 기준액으로. 공고문 기준표와 대조할 때 쓴다. */
export function premiumFromIncome(monthlyIncome: number): number {
  return Math.round(monthlyIncome * HEALTH_INSURANCE.rate * HEALTH_INSURANCE.employee_share);
}
