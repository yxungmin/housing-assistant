import { z } from "zod";
import {
  GroupMode,
  HousingType,
  IncomeType,
  MarriageStatus,
  PricingKind,
  RuleCategory,
  RuleOperator,
  VersionStatus,
} from "./enums.js";

/** 공고문 근거. 모든 룰·가격은 원문 페이지와 발췌를 가진다. */
export const Source = z.object({
  page: z.number().int().min(1).describe("공고문 PDF 페이지 (1부터)"),
  text: z.string().min(1).max(500).describe("근거가 되는 원문 발췌"),
});
export type Source = z.infer<typeof Source>;

/**
 * 룰이 적용되는 대상. 비어 있으면 모든 사용자에게 적용.
 * 예: 3인 가구·맞벌이에게만 적용되는 소득 상한.
 */
export const AppliesTo = z
  .object({
    household_size: z.number().int().min(1).max(10).optional().describe("가구원 수 (정확히 이 값)"),
    household_size_min: z.number().int().min(1).optional(),
    household_size_max: z.number().int().min(1).optional(),
    income_type: IncomeType.optional(),
    marriage: z.array(MarriageStatus).optional(),
  })
  .strict();
export type AppliesTo = z.infer<typeof AppliesTo>;

export const RuleValue = z.union([
  z.number(),
  z.string(),
  z.literal(true),
  z.tuple([z.number(), z.number()]),
  z.array(z.string()).min(1),
  z.array(z.number()).min(1),
]);
export type RuleValue = z.infer<typeof RuleValue>;

export const RuleGroup = z.object({
  id: z.string().min(1).describe("트랙 안에서 유일한 그룹 id (예: newlywed_status)"),
  mode: GroupMode,
  label: z.string().min(1).describe("사용자에게 보이는 그룹 이름 (예: 신혼부부 자격)"),
});
export type RuleGroup = z.infer<typeof RuleGroup>;

export const EligibilityRule = z
  .object({
    group_id: z.string().min(1),
    category: RuleCategory,
    applies_to: AppliesTo.default({}),
    operator: RuleOperator,
    value: RuleValue,
    unit: z.string().optional().describe("KRW_monthly, KRW, years, months, count, minutes, region_code ..."),
    source: Source,
    confidence: z.number().min(0).max(1),
    verified: z.boolean().default(false),
  })
  .superRefine((rule, ctx) => {
    const v = rule.value;
    switch (rule.operator) {
      case "between":
        if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number") {
          ctx.addIssue({ code: "custom", path: ["value"], message: "between은 [min, max] 숫자 배열이어야 한다" });
        } else if (v[0] > (v[1] as number)) {
          ctx.addIssue({ code: "custom", path: ["value"], message: "between의 min이 max보다 크다" });
        }
        break;
      case "in":
        if (!Array.isArray(v) || v.length === 0) {
          ctx.addIssue({ code: "custom", path: ["value"], message: "in은 비어 있지 않은 배열이어야 한다" });
        }
        break;
      case "is_true":
        if (v !== true) ctx.addIssue({ code: "custom", path: ["value"], message: "is_true의 value는 true" });
        break;
      default:
        if (typeof v !== "number" && typeof v !== "string") {
          ctx.addIssue({ code: "custom", path: ["value"], message: `${rule.operator}의 value는 숫자 또는 문자열` });
        }
    }
    if (rule.category === "income" && typeof v === "number" && v < 0) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "소득 상한이 음수" });
    }
  });
export type EligibilityRule = z.infer<typeof EligibilityRule>;

export const UnitType = z.object({
  name: z.string().min(1).describe("주택형 이름 (예: 26A, 36, 55)"),
  exclusive_area_m2: z.number().positive().optional(),
  households: z.number().int().min(0).optional(),
});
export type UnitType = z.infer<typeof UnitType>;

/**
 * 전환보증금. LH 공고는 방향별 이율이 다르다 (예: 보증금 증액·월세 감액 7.0%, 보증금 감액·월세 증액 3.5%).
 * rate = 증액 방향(보증금↑ 월세↓), rate_down = 감액 방향(보증금↓ 월세↑). 감액 이율이 없으면 rate를 쓴다.
 */
export const Conversion = z.object({
  rate: z.number().min(0).max(1).describe("보증금 증액(월세 감액) 전환 이율 (연, 0.07 = 7%)"),
  rate_down: z.number().min(0).max(1).optional().describe("보증금 감액(월세 증액) 전환 이율. 없으면 rate와 같음"),
  max_deposit: z.number().int().min(0).optional().describe("최대 전환 시 보증금 상한 (원)"),
  min_deposit: z.number().int().min(0).optional().describe("최대 전환 시 보증금 하한 (원)"),
});

export const PaymentInstallment = z.object({
  label: z.string().min(1).describe("계약금 / 중도금 1회 / 잔금 ..."),
  ratio: z.number().min(0).max(1),
  due: z.string().optional().describe("YYYY-MM-DD 또는 '입주지정일' 같은 원문 표현"),
});

export const Pricing = z
  .object({
    unit_type: z.string().min(1),
    tier: z.string().optional().describe("같은 주택형 안에서 임대조건이 갈리는 계층 (예: 소득있는 청년, 고령자). 트랙 전체에 같으면 생략"),
    kind: PricingKind,
    deposit: z.number().int().min(0).optional().describe("임대보증금 (원)"),
    monthly_rent: z.number().int().min(0).optional().describe("월임대료 (원)"),
    sale_price: z.number().int().min(0).optional().describe("분양가 (원)"),
    conversion: Conversion.optional(),
    payment_schedule: z.array(PaymentInstallment).optional(),
    maintenance_estimate: z.number().int().min(0).optional().describe("관리비 추정 (원/월)"),
    source: Source,
  })
  .superRefine((p, ctx) => {
    if (p.kind === "rental" && (p.deposit === undefined || p.monthly_rent === undefined)) {
      ctx.addIssue({ code: "custom", message: "rental은 deposit과 monthly_rent가 필요" });
    }
    if (p.kind === "sale" && p.sale_price === undefined) {
      ctx.addIssue({ code: "custom", path: ["sale_price"], message: "sale은 sale_price가 필요" });
    }
  });
export type Pricing = z.infer<typeof Pricing>;

export const SupplyTrack = z
  .object({
    name: z.string().min(1).describe("공급 트랙 이름 (예: 신혼부부 우선공급, 일반공급)"),
    households: z.number().int().min(0).optional(),
    unit_types: z.array(UnitType).default([]),
    rule_groups: z.array(RuleGroup).default([]),
    rules: z.array(EligibilityRule).default([]),
    pricing: z.array(Pricing).default([]),
  })
  .superRefine((track, ctx) => {
    const groupIds = new Set(track.rule_groups.map((g) => g.id));
    if (groupIds.size !== track.rule_groups.length) {
      ctx.addIssue({ code: "custom", path: ["rule_groups"], message: "그룹 id가 중복됨" });
    }
    track.rules.forEach((rule, i) => {
      if (!groupIds.has(rule.group_id)) {
        ctx.addIssue({ code: "custom", path: ["rules", i, "group_id"], message: `정의되지 않은 그룹 ${rule.group_id}` });
      }
    });
    const unitNames = new Set(track.unit_types.map((u) => u.name));
    track.pricing.forEach((p, i) => {
      if (unitNames.size > 0 && !unitNames.has(p.unit_type)) {
        ctx.addIssue({ code: "custom", path: ["pricing", i, "unit_type"], message: `unit_types에 없는 주택형 ${p.unit_type}` });
      }
    });
  });
export type SupplyTrack = z.infer<typeof SupplyTrack>;

export const Schedule = z.object({
  notice_date: z.string().optional().describe("공고일 YYYY-MM-DD"),
  apply_start: z.string().optional().describe("접수 시작 YYYY-MM-DD"),
  apply_end: z.string().optional().describe("접수 종료 YYYY-MM-DD"),
  winner_announce: z.string().optional(),
  move_in: z.string().optional().describe("입주 예정 (YYYY-MM 또는 원문 표현)"),
});
export type Schedule = z.infer<typeof Schedule>;

/**
 * LLM이 공고문 1건에서 채우는 결정론적 스키마. 판단은 하지 않고 구조만 채운다.
 * 수집기는 이 결과를 검증한 뒤 announcement_versions / supply_tracks / rule_groups /
 * eligibility_rules / pricing 테이블로 분해해 저장한다.
 */
export const ExtractionOutput = z.object({
  title: z.string().min(1),
  housing_type: HousingType,
  address: z.string().optional().describe("단지 주소 (도로명 또는 지번)"),
  schedule: Schedule,
  tracks: z.array(SupplyTrack).min(1),
  notes: z.array(z.string()).default([]).describe("구조화하지 못한 중요 조건의 원문 발췌"),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

export const AnnouncementVersion = z.object({
  id: z.string().uuid().optional(),
  announcement_id: z.string().uuid(),
  version: z.number().int().min(1),
  status: VersionStatus,
  source_modified_at: z.string().optional(),
  extracted_at: z.string(),
  verified_at: z.string().optional(),
  conflict_reasons: z.array(z.string()).default([]),
  extraction: ExtractionOutput,
});
export type AnnouncementVersion = z.infer<typeof AnnouncementVersion>;

export const Announcement = z.object({
  id: z.string().uuid(),
  lh_id: z.string().min(1),
  title: z.string().min(1),
  housing_type: HousingType,
  region_code: z.string().min(1).describe("시도 코드 (예: 11 서울, 41 경기)"),
  published_version: z.number().int().min(1).optional(),
  notice_date: z.string().optional(),
  apply_start: z.string().optional(),
  apply_end: z.string().optional(),
  pdf_url: z.string().url().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  transit: z
    .object({
      nearest_station: z.string().optional(),
      station_walk_min: z.number().optional(),
      nearest_bus_stop: z.string().optional(),
      bus_walk_min: z.number().optional(),
    })
    .optional(),
  updated_at: z.string(),
});
export type Announcement = z.infer<typeof Announcement>;
