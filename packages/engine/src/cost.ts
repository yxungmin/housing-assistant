import type { LoanProduct, Pricing, UserProfile } from "@housing/schema";
import { matchTrack } from "./match";

/** 원리금균등 월 상환액. rate는 연이율, termMonths는 기간(개월). */
export function pmt(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / termMonths;
  const f = (1 + r) ** termMonths;
  return (principal * r * f) / (f - 1);
}

export function monthlyInterest(principal: number, annualRate: number): number {
  return (principal * annualRate) / 12;
}

/** rate_table에서 소득·보증금에 맞는 첫 구간의 금리. 맞는 구간이 없으면 마지막 구간. */
export function pickRate(product: LoanProduct, monthlyIncome: number | undefined, deposit: number): number {
  for (const tier of product.rate_table) {
    const incomeOk = tier.max_income === undefined || (monthlyIncome !== undefined && monthlyIncome <= tier.max_income);
    const depositOk = tier.max_deposit === undefined || deposit <= tier.max_deposit;
    if (incomeOk && depositOk) return tier.annual_rate;
  }
  return product.rate_table[product.rate_table.length - 1]!.annual_rate;
}

/** 대출 상품의 자격 룰을 매칭 엔진과 같은 방식으로 평가. MISMATCH가 없으면 적용 가능. */
export function eligibleLoans(products: LoanProduct[], profile: UserProfile): LoanProduct[] {
  return products.filter((p) => {
    const result = matchTrack(
      { name: p.name, unit_types: [], rule_groups: p.rule_groups, rules: p.eligibility, pricing: [] },
      profile,
    );
    return result.summary.mismatched === 0;
  });
}

export interface LoanQuote {
  product: LoanProduct;
  amount: number;
  annual_rate: number;
  monthly_payment: number;
  interest_only: boolean;
  as_of_date: string;
}

/** 한도 = min(상품 한도, 보증금 × LTV, [DSR 조건이 있을 때만] 상환 가능액 기준 원금). */
export function loanLimit(product: LoanProduct, deposit: number, profile: UserProfile): LoanQuote {
  const rate = pickRate(product, profile.monthly_income, deposit);
  // 보증금 × 비율은 부동소수 오차(30,463,999.99…)가 나므로 천 원 단위로 반올림한다
  let amount = Math.min(product.max_amount, Math.round((deposit * product.ltv) / 1000) * 1000);
  if (product.dsr_limit !== undefined && profile.monthly_income !== undefined) {
    const capacity = profile.monthly_income * product.dsr_limit - (profile.monthly_debt_payment ?? 0);
    if (capacity <= 0) amount = 0;
    else {
      // 상환 가능 월액으로 감당되는 최대 원금 (원리금균등 기준으로 역산)
      const r = rate / 12;
      const n = product.term_months;
      const maxPrincipal = r === 0 ? capacity * n : (capacity * ((1 + r) ** n - 1)) / (r * (1 + r) ** n);
      amount = Math.min(amount, Math.floor(maxPrincipal));
    }
  }
  amount = Math.max(0, amount);
  const monthly = product.interest_only ? monthlyInterest(amount, rate) : pmt(amount, rate, product.term_months);
  return {
    product,
    amount,
    annual_rate: rate,
    monthly_payment: Math.round(monthly),
    interest_only: product.interest_only,
    as_of_date: product.as_of_date,
  };
}

export interface CostBreakdown {
  deposit: number;
  monthly_rent: number;
  maintenance_estimate: number;
  loan: LoanQuote | null;
  required_cash: number;
  shortfall: number;
  monthly_housing_cost: number;
  monthly_debt_payment: number;
  income_ratio: number | null;
  sources: { label: string; detail: string }[];
}

export interface CostOptions {
  /**
   * 관리비 기재값이 없을 때 쓰는 추정 (원/월)과 그 근거 한 줄.
   * K-apt 단가 × 전용면적(maintenance.ts estimateMaintenance)에서 온다. 공고문 값이 있으면 그쪽이 이긴다.
   */
  maintenance?: { amount: number; detail: string };
  /** 기재값도 추정도 없을 때 기본값 (원/월). 문서 미결 사항 — 기본 100,000 */
  defaultMaintenance?: number;
  /** 사용자가 고른 대출 상품 id. 없으면 금리가 가장 낮은(같으면 한도가 큰) 적용 가능 상품 */
  preferredLoanId?: string;
}

/**
 * 임대 공고 1건(주택형 1개)의 비용 분해. 분양(sale)은 V0.1 범위 밖 → 예외.
 */
export function computeRentalCost(
  pricing: Pricing,
  loans: LoanProduct[],
  profile: UserProfile,
  options: CostOptions = {},
): CostBreakdown {
  if (pricing.kind !== "rental") throw new Error("V0.1 비용 계산은 임대(rental)만 지원한다");
  const deposit = pricing.deposit ?? 0;
  const rent = pricing.monthly_rent ?? 0;
  const maintenance = pricing.maintenance_estimate ?? options.maintenance?.amount ?? options.defaultMaintenance ?? 100_000;

  const eligible = eligibleLoans(loans, profile);
  const quotes = eligible.map((p) => loanLimit(p, deposit, profile)).filter((q) => q.amount > 0);
  let loan: LoanQuote | null = null;
  if (options.preferredLoanId) loan = quotes.find((q) => q.product.id === options.preferredLoanId) ?? null;
  if (!loan && quotes.length > 0) {
    // 기본 선택: 금리가 가장 낮은 상품, 같으면 한도가 큰 상품 (필요 현금을 가장 줄여 주는 쪽)
    quotes.sort((a, b) => a.annual_rate - b.annual_rate || b.amount - a.amount);
    loan = quotes[0]!;
  }

  const requiredCash = Math.max(0, deposit - (loan?.amount ?? 0));
  const shortfall = Math.max(0, requiredCash - (profile.cash_on_hand ?? 0));
  const monthlyDebt = profile.monthly_debt_payment ?? 0;
  const monthlyHousing = rent + (loan?.monthly_payment ?? 0) + maintenance;
  const ratio =
    profile.monthly_income && profile.monthly_income > 0 ? (monthlyHousing + monthlyDebt) / profile.monthly_income : null;

  const sources: CostBreakdown["sources"] = [
    { label: "보증금·월임대료", detail: `공고문 ${pricing.source.page}쪽` },
  ];
  if (pricing.maintenance_estimate !== undefined) sources.push({ label: "관리비", detail: `공고문 ${pricing.source.page}쪽` });
  else if (options.maintenance) sources.push({ label: "관리비", detail: options.maintenance.detail });
  else sources.push({ label: "관리비", detail: "공고문에 없어 추정값 사용" });
  if (loan) sources.push({ label: "대출", detail: `${loan.product.name} · ${loan.as_of_date} 기준` });

  return {
    deposit,
    monthly_rent: rent,
    maintenance_estimate: maintenance,
    loan,
    required_cash: requiredCash,
    shortfall,
    monthly_housing_cost: Math.round(monthlyHousing),
    monthly_debt_payment: monthlyDebt,
    income_ratio: ratio,
    sources,
  };
}

export interface ConversionScenario {
  deposit: number;
  monthly_rent: number;
}

/**
 * 전환보증금 시나리오.
 *  - 보증금을 올리면(증액) 월임대료가 extra × rate / 12 줄어든다.
 *  - 보증금을 내리면(감액) 월임대료가 |extra| × rate_down / 12 늘어난다 (rate_down 없으면 rate).
 * 보증금은 [min_deposit(없으면 기본 보증금), max_deposit] 범위로 자른다. 음수 월세는 0.
 */
export function conversionScenario(pricing: Pricing, targetDeposit: number): ConversionScenario {
  if (pricing.kind !== "rental" || !pricing.conversion) {
    return { deposit: pricing.deposit ?? 0, monthly_rent: pricing.monthly_rent ?? 0 };
  }
  const base = pricing.deposit ?? 0;
  const { rate, rate_down, min_deposit, max_deposit } = pricing.conversion;
  const min = min_deposit ?? base;
  const max = max_deposit ?? Number.POSITIVE_INFINITY;
  const deposit = Math.min(Math.max(targetDeposit, min), max);
  const extra = deposit - base;
  const appliedRate = extra >= 0 ? rate : (rate_down ?? rate);
  const rent = (pricing.monthly_rent ?? 0) - (extra * appliedRate) / 12;
  return { deposit, monthly_rent: Math.max(0, Math.round(rent)) };
}
