import { z } from "zod";
import { IncomeType, MarriageStatus, SpecialStatus } from "./enums";

/**
 * 사용자 프로필. 기기 SecureStore에만 저장되며 서버로 전송되지 않는다.
 * 각 필드는 RuleCategory와 대응한다 (profileValueFor 참고).
 */
export const UserProfile = z.object({
  region_code: z.string().min(2).optional().describe("거주 시도 코드"),
  age: z.number().int().min(0).max(120).optional(),
  marriage: MarriageStatus.optional(),
  marriage_years: z.number().min(0).optional().describe("혼인 기간 (년). 예비신혼부부는 0"),
  household_size: z.number().int().min(1).max(10).optional(),
  children_count: z.number().int().min(0).optional(),
  children_ages: z.array(z.number().int().min(0)).optional(),
  income_type: IncomeType.optional(),
  monthly_income: z.number().int().min(0).optional().describe("가구 월평균소득 (원, 세전)"),
  total_assets: z.number().int().min(0).optional().describe("총자산 (원)"),
  car_value: z.number().int().min(0).optional(),
  monthly_debt_payment: z.number().int().min(0).optional().describe("기존 부채 월 상환액 (원)"),
  homeless_months: z.number().int().min(0).optional().describe("무주택 기간 (개월). 유주택자는 undefined"),
  is_homeless: z.boolean().optional(),
  subscription_months: z.number().int().min(0).optional().describe("청약통장 가입기간 (개월)"),
  subscription_deposits: z.number().int().min(0).optional().describe("납입 횟수"),
  cash_on_hand: z.number().int().min(0).optional().describe("보유 현금 (원)"),
  statuses: z.array(SpecialStatus).optional().describe("해당하는 계층 자격. 빈 배열 = 해당 없음, undefined = 미입력"),
  workplace: z
    .object({
      label: z.string().optional(),
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  commute_limit_min: z.number().int().min(0).optional().describe("허용 통근 시간 상한 (분)"),
});
export type UserProfile = z.infer<typeof UserProfile>;
