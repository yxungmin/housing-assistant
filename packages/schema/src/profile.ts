import { z } from "zod";
import { IncomeType, MarriageStatus, SpecialStatus } from "./enums";

/**
 * 사용자 프로필. 기기 SecureStore에만 저장되며 서버로 전송되지 않는다.
 * 각 필드는 RuleCategory와 대응한다 (profileValueFor 참고).
 */
export const UserProfile = z.object({
  region_code: z.string().min(2).optional().describe("거주 시도 코드 (11 서울, 41 경기 …)"),
  region_sigungu: z.string().optional().describe('거주 시군구 "시도약칭 시군구" 형식 (예: "경기 과천시")'),
  /** 생년월일 YYYY-MM-DD. 공고는 출생일 범위로 나이를 정하므로 원본은 이것이고 age는 여기서 계산한다 */
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** 만 나이. birth_date가 있으면 엔진이 그날 기준으로 다시 계산한다 */
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
  subscription_months: z.number().int().min(0).optional().describe("청약통장 가입기간 (개월, subscription_as_of 기준)"),
  subscription_deposits: z.number().int().min(0).optional().describe("납입 횟수 (subscription_as_of 기준)"),
  subscription_as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("위 두 값을 입력한 날. 납입 중이면 이후 지난 달수를 더한다"),
  subscription_active: z.boolean().optional().describe("지금도 매달 납입 중인가"),
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
