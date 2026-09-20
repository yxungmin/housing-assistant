import type { LoanProduct } from "@housing/schema";

/**
 * 대출 룰 (supabase/seed/loan_products.sql과 같은 값). Supabase 연결 후에는 loan_products 테이블에서 받는다.
 * 금액·금리는 자리표시 값이며 as_of_date를 화면에 노출한다.
 */
const src = { page: 1, text: "상품 안내" };

export const LOANS: LoanProduct[] = [
  {
    id: "hf-buteomok",
    name: "버팀목 전세자금대출",
    provider: "주택도시기금",
    kind: "rental_deposit",
    rule_groups: [{ id: "basic", mode: "all_of", label: "기본 요건" }],
    eligibility: [
      { group_id: "basic", category: "housing", applies_to: {}, operator: "gte", value: 0, unit: "months", source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "income", applies_to: {}, operator: "lte", value: 4_166_667, unit: "KRW_monthly", source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "asset", applies_to: {}, operator: "lte", value: 345_000_000, unit: "KRW", source: src, confidence: 1, verified: true },
    ],
    max_amount: 120_000_000,
    ltv: 0.7,
    term_months: 24,
    interest_only: true,
    rate_table: [
      { max_income: 2_000_000, annual_rate: 0.023 },
      { max_income: 3_333_333, annual_rate: 0.026 },
      { annual_rate: 0.029 },
    ],
    as_of_date: "2026-09-01",
  },
  {
    id: "hf-buteomok-newlywed",
    name: "신혼부부 전용 버팀목 전세자금대출",
    provider: "주택도시기금",
    kind: "rental_deposit",
    rule_groups: [{ id: "basic", mode: "all_of", label: "기본 요건" }],
    eligibility: [
      { group_id: "basic", category: "housing", applies_to: {}, operator: "gte", value: 0, unit: "months", source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "marriage", applies_to: {}, operator: "lte", value: 7, unit: "years", source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "income", applies_to: {}, operator: "lte", value: 6_250_000, unit: "KRW_monthly", source: src, confidence: 1, verified: true },
    ],
    max_amount: 300_000_000,
    ltv: 0.8,
    term_months: 24,
    interest_only: true,
    rate_table: [
      { max_income: 2_000_000, annual_rate: 0.015 },
      { max_income: 4_166_667, annual_rate: 0.02 },
      { annual_rate: 0.027 },
    ],
    as_of_date: "2026-09-01",
  },
  {
    id: "hf-youth-buteomok",
    name: "청년전용 버팀목 전세자금대출",
    provider: "주택도시기금",
    kind: "rental_deposit",
    rule_groups: [{ id: "basic", mode: "all_of", label: "기본 요건" }],
    eligibility: [
      { group_id: "basic", category: "housing", applies_to: {}, operator: "gte", value: 0, unit: "months", source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "age", applies_to: {}, operator: "between", value: [19, 34], unit: "years", source: src, confidence: 1, verified: true },
      { group_id: "basic", category: "income", applies_to: {}, operator: "lte", value: 4_166_667, unit: "KRW_monthly", source: src, confidence: 1, verified: true },
    ],
    max_amount: 200_000_000,
    ltv: 0.8,
    term_months: 24,
    interest_only: true,
    rate_table: [
      { max_income: 1_666_667, annual_rate: 0.02 },
      { max_income: 3_333_333, annual_rate: 0.023 },
      { annual_rate: 0.031 },
    ],
    as_of_date: "2026-09-01",
  },
];

export const LOAN_AS_OF = "2026-09-01";
