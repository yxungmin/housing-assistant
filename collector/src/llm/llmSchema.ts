/**
 * LLM에 보내는 출력 스키마. 내부 스키마(@housing/schema ExtractionOutput)와 같은 정보를 담지만
 * 구조화 출력 문법 크기를 줄이기 위해
 *  - 모든 필드를 필수로 두고 없는 값은 null (optional 조합 폭발 방지)
 *  - 룰 값(value)은 유니온 대신 JSON 문자열 하나 (value_json)
 *  - 튜플·최소/최대 같은 문법 미지원 제약은 쓰지 않는다
 * 로 평탄화한다. toExtractionOutput()이 내부 스키마로 바꾸고 최종 검증한다.
 */
import { z } from "zod";
import {
  ExtractionOutput,
  GroupMode,
  HousingType,
  IncomeType,
  MarriageStatus,
  PricingKind,
  RuleCategory,
  RuleOperator,
} from "@housing/schema";

const nstr = z.string().nullable();
const nnum = z.number().nullable();

const LlmSource = z.object({
  page: z.number().describe("=== p.N === 표시의 N"),
  text: z.string().describe("근거 원문 발췌 (500자 이내)"),
});

const LlmAppliesTo = z.object({
  household_size: nnum.describe("이 가구원 수에만 적용. 전체 적용이면 null"),
  household_size_min: nnum,
  household_size_max: nnum,
  income_type: IncomeType.nullable().describe("single 외벌이 / dual 맞벌이 / null 전체"),
  marriage: z.array(MarriageStatus).nullable(),
});

const LlmRule = z.object({
  group_id: z.string().describe("rule_groups의 id"),
  category: RuleCategory,
  applies_to: LlmAppliesTo,
  operator: RuleOperator,
  value_json: z
    .string()
    .describe('값을 JSON 문자열로. 예: "8640000", "[19,39]", "[\\"11\\",\\"41\\"]", "true"'),
  unit: nstr.describe("KRW_monthly, KRW, years, months, count, child_age, status, minutes, region_code ..."),
  source: LlmSource,
  confidence: z.number().describe("0~1"),
});

const LlmRuleGroup = z.object({
  id: z.string(),
  mode: GroupMode,
  label: z.string(),
});

const LlmUnitType = z.object({
  name: z.string(),
  exclusive_area_m2: nnum,
  households: nnum,
});

const LlmConversion = z.object({
  rate: z.number().describe("보증금 증액(월세 감액) 전환 이율, 소수 (7% → 0.07)"),
  rate_down: nnum.describe("보증금 감액(월세 증액) 이율. 없으면 null"),
  max_deposit: nnum.describe("최대 증액 시 보증금 (원)"),
  min_deposit: nnum.describe("최대 감액 시 보증금 (원)"),
});

const LlmInstallment = z.object({
  label: z.string(),
  ratio: z.number(),
  due: nstr,
});

const LlmPricing = z.object({
  unit_type: z.string(),
  tier: nstr.describe("같은 주택형에서 임대조건이 갈리는 계층 이름. 없으면 null"),
  kind: PricingKind,
  deposit: nnum.describe("임대보증금 (원)"),
  monthly_rent: nnum.describe("월임대료 (원)"),
  sale_price: nnum.describe("분양가 (원)"),
  conversion: LlmConversion.nullable(),
  payment_schedule: z.array(LlmInstallment).nullable(),
  maintenance_estimate: nnum,
  source: LlmSource,
});

const LlmTrack = z.object({
  name: z.string(),
  households: nnum,
  unit_types: z.array(LlmUnitType),
  rule_groups: z.array(LlmRuleGroup),
  rules: z.array(LlmRule),
  pricing: z.array(LlmPricing),
});

export const LlmExtraction = z.object({
  title: z.string(),
  housing_type: HousingType,
  address: nstr,
  schedule: z.object({
    notice_date: nstr.describe("YYYY-MM-DD"),
    apply_start: nstr,
    apply_end: nstr,
    winner_announce: nstr,
    move_in: nstr,
  }),
  tracks: z.array(LlmTrack),
  notes: z.array(z.string()),
});
export type LlmExtraction = z.infer<typeof LlmExtraction>;

const und = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

function parseValue(raw: string): unknown {
  const s = raw.trim();
  try {
    return JSON.parse(s);
  } catch {
    const n = Number(s.replace(/,/g, ""));
    if (s !== "" && Number.isFinite(n)) return n;
    if (s === "true") return true;
    return s;
  }
}

/** LLM 출력 → 내부 ExtractionOutput. 최종 스키마 검증(그룹 참조·between 길이 등)은 여기서 한다. */
export function toExtractionOutput(llm: LlmExtraction): ReturnType<typeof ExtractionOutput.safeParse> {
  const candidate = {
    title: llm.title,
    housing_type: llm.housing_type,
    address: und(llm.address),
    schedule: {
      notice_date: und(llm.schedule.notice_date),
      apply_start: und(llm.schedule.apply_start),
      apply_end: und(llm.schedule.apply_end),
      winner_announce: und(llm.schedule.winner_announce),
      move_in: und(llm.schedule.move_in),
    },
    tracks: llm.tracks.map((t) => ({
      name: t.name,
      households: und(t.households),
      unit_types: t.unit_types.map((u) => ({
        name: u.name,
        exclusive_area_m2: und(u.exclusive_area_m2),
        households: und(u.households),
      })),
      rule_groups: t.rule_groups,
      rules: t.rules.map((r) => ({
        group_id: r.group_id,
        category: r.category,
        applies_to: {
          household_size: und(r.applies_to.household_size),
          household_size_min: und(r.applies_to.household_size_min),
          household_size_max: und(r.applies_to.household_size_max),
          income_type: und(r.applies_to.income_type),
          marriage: und(r.applies_to.marriage),
        },
        operator: r.operator,
        value: parseValue(r.value_json),
        unit: und(r.unit),
        source: r.source,
        confidence: Math.min(1, Math.max(0, r.confidence)),
        verified: false,
      })),
      pricing: t.pricing.map((p) => ({
        unit_type: p.unit_type,
        tier: und(p.tier),
        kind: p.kind,
        deposit: und(p.deposit),
        monthly_rent: und(p.monthly_rent),
        sale_price: und(p.sale_price),
        conversion: p.conversion
          ? {
              rate: p.conversion.rate,
              rate_down: und(p.conversion.rate_down),
              max_deposit: und(p.conversion.max_deposit),
              min_deposit: und(p.conversion.min_deposit),
            }
          : undefined,
        payment_schedule: p.payment_schedule
          ? p.payment_schedule.map((i) => ({ label: i.label, ratio: i.ratio, due: und(i.due) }))
          : undefined,
        maintenance_estimate: und(p.maintenance_estimate),
        source: p.source,
      })),
    })),
    notes: llm.notes,
  };
  return ExtractionOutput.safeParse(candidate);
}
