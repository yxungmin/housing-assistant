import { z } from "zod";
import { EligibilityRule, RuleGroup } from "./rules";

/**
 * 대출 상품 룰 (수동 관리, supabase/seed). as_of_date를 화면에 노출한다.
 * V0.1은 전세·임대보증금 대출만 다룬다.
 */
export const RateTier = z.object({
  max_income: z.number().int().optional().describe("이 소득 이하에 적용 (원/월). 없으면 상한 없음"),
  max_deposit: z.number().int().optional().describe("이 보증금 이하에 적용 (원)"),
  annual_rate: z.number().min(0).max(1),
});

export const LoanProduct = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1).describe("주택도시기금, 은행명 등"),
  kind: z.literal("rental_deposit"),
  rule_groups: z.array(RuleGroup).default([]),
  eligibility: z.array(EligibilityRule).default([]),
  max_amount: z.number().int().min(0).describe("상품 한도 (원)"),
  ltv: z.number().min(0).max(1).describe("보증금 대비 대출 비율 (0.8 = 80%)"),
  dsr_limit: z.number().min(0).max(1).optional().describe("있을 때만 상환 가능액을 추가로 적용"),
  term_months: z.number().int().min(1).describe("대출 기간 (개월)"),
  interest_only: z.boolean().default(true).describe("만기일시상환(이자만) 상품인가"),
  rate_table: z.array(RateTier).min(1),
  as_of_date: z.string().describe("금리·조건 기준일 YYYY-MM-DD"),
  source_url: z.string().url().optional(),
});
export type LoanProduct = z.infer<typeof LoanProduct>;
