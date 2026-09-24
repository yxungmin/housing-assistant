/**
 * LLM에 보내는 출력 스키마. 내부 스키마(@housing/schema ExtractionOutput)와 같은 정보를 담지만
 * 구조화 출력 문법 크기를 줄이기 위해
 *  - 모든 필드를 필수로 두고 없는 값은 null (optional 조합 폭발 방지)
 *  - 룰 값(value)은 유니온 대신 JSON 문자열 하나 (value_json)
 *  - 튜플·최소/최대 같은 문법 미지원 제약은 쓰지 않는다
 * 로 평탄화한다. toExtractionOutput()이 내부 스키마로 바꾸고 최종 검증한다.
 *
 * 출력 토큰이 추출 비용의 70%라, 모델이 만들 필요가 없는 값은 빼 뒀다 (2026-09-21, `npm run output:size`):
 *  - `applies_to`는 객체째 nullable. 530룰 중 240번이 키 5개 전부 null이었다.
 *  - `payment_schedule`은 아예 받지 않는다. 분양 전용인데 엔진은 rental만 받아 읽는 코드가 없다.
 *    내부 스키마와 DB 컬럼은 그대로 두었으니 분양 계산을 붙일 때(V0.2) 여기만 되살리면 된다.
 *  - `notes`는 개수 상한을 설명에 적는다. 앱은 4개만 보여 준다.
 * 줄인 이유는 돈보다 정확도다 — 출력이 길수록 틀릴 자리가 늘어난다.
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
  SelectionStep,
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
  applies_to: LlmAppliesTo.nullable().describe("이 룰이 일부 대상에게만 적용될 때만 채운다. 전체 적용이면 null"),
  operator: RuleOperator,
  value_json: z
    .string()
    .describe('값을 JSON 문자열로. 예: "8640000", "[19,39]", "[\\"11\\",\\"41\\"]", "true"'),
  unit: nstr.describe("KRW_monthly, KRW, years, months, count, child_age, status, minutes, region_code ..."),
  source: LlmSource,
  confidence: z.number().describe("0~1"),
  bonuses: z
    .array(z.object({ newborn_children_min: z.number(), value: z.number().describe("완화된 상한") }))
    .describe("출산자녀 가산으로 상한이 올라가면 그 상한들. 없으면 빈 배열"),
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

const LlmPricing = z.object({
  unit_type: z.string(),
  tier: nstr.describe("같은 주택형에서 임대조건이 갈리는 계층 이름. 없으면 null"),
  kind: PricingKind,
  deposit: nnum.describe("임대보증금 (원)"),
  monthly_rent: nnum.describe("월임대료 (원)"),
  sale_price: nnum.describe("분양가 (원)"),
  conversion: LlmConversion.nullable(),
  maintenance_estimate: nnum,
  source: LlmSource,
});

const LlmRankCondition = z.object({
  category: RuleCategory,
  applies_to: LlmAppliesTo.nullable(),
  operator: RuleOperator,
  value_json: z.string().describe("룰의 value_json과 같은 형식"),
  unit: nstr,
});

const LlmRank = z.object({
  rank: z.number().describe("1 = 1순위"),
  label: z.string().describe("원문 요약 (예: 양산시 거주자). 60자 이내"),
  mode: GroupMode,
  conditions: z.array(LlmRankCondition).describe("빈 배열 = 앞 순위에 해당하지 않는 나머지 전부"),
  apply_date: nstr.describe("순위별 접수일이 따로 있을 때만 YYYY-MM-DD, 아니면 null"),
  source: LlmSource,
});

const LlmTrack = z.object({
  name: z.string(),
  households: nnum,
  unit_types: z.array(LlmUnitType),
  rule_groups: z.array(LlmRuleGroup),
  rules: z.array(LlmRule),
  pricing: z.array(LlmPricing),
  priority_ranks: z.array(LlmRank).describe("입주자 선정 순위. 순위제가 아니면 빈 배열"),
  selection_order: z.array(SelectionStep).nullable().describe("경쟁 시 선정 순서 (예: 순위→배점→추첨이면 [rank,score,lottery]). 공고문에 없으면 null"),
  residence: z
    .object({ contract_years: nnum, max_years: nnum, note: nstr.describe("조건별로 다르면 요약. 60자 이내") })
    .nullable()
    .describe("계약 기간과 최장 거주 기간. 공고문에 없으면 null"),
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
    documents_announce: nstr.describe("서류제출 대상자 발표"),
    documents_start: nstr,
    documents_end: nstr,
    contract_start: nstr,
    contract_end: nstr,
  }),
  application: z
    .object({
      online: z.boolean().nullable(),
      onsite: z.boolean().nullable(),
      onsite_for: nstr.describe("현장 접수가 일부 대상에게만 되면 그 대상"),
      place: nstr.describe("현장 접수 장소"),
      source: LlmSource.nullable(),
    })
    .nullable()
    .describe("접수 방법. 공고문에 없으면 null"),
  tracks: z.array(LlmTrack),
  notes: z.array(z.string()).describe("구조화하지 못한 중요 조건의 원문 발췌. 가장 중요한 것 6개까지만"),
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
      documents_announce: und(llm.schedule.documents_announce),
      documents_start: und(llm.schedule.documents_start),
      documents_end: und(llm.schedule.documents_end),
      contract_start: und(llm.schedule.contract_start),
      contract_end: und(llm.schedule.contract_end),
    },
    ...(llm.application
      ? {
          application: {
            online: und(llm.application.online),
            onsite: und(llm.application.onsite),
            onsite_for: und(llm.application.onsite_for),
            place: und(llm.application.place),
            source: und(llm.application.source),
          },
        }
      : {}),
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
        applies_to: r.applies_to
          ? {
              household_size: und(r.applies_to.household_size),
              household_size_min: und(r.applies_to.household_size_min),
              household_size_max: und(r.applies_to.household_size_max),
              income_type: und(r.applies_to.income_type),
              marriage: und(r.applies_to.marriage),
            }
          : {},
        operator: r.operator,
        value: parseValue(r.value_json),
        unit: und(r.unit),
        source: r.source,
        confidence: Math.min(1, Math.max(0, r.confidence)),
        verified: false,
        ...(r.bonuses.length ? { bonuses: r.bonuses } : {}),
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
        maintenance_estimate: und(p.maintenance_estimate),
        source: p.source,
      })),
      // 빈 배열은 "순위제 아님"이라 필드째 뺀다 — 내부 스키마에서 없음과 같은 뜻이다
      ...(t.priority_ranks.length
        ? {
            priority_ranks: t.priority_ranks.map((r) => ({
              rank: r.rank,
              label: r.label,
              mode: r.mode,
              conditions: r.conditions.map((c) => ({
                category: c.category,
                applies_to: c.applies_to
                  ? {
                      household_size: und(c.applies_to.household_size),
                      household_size_min: und(c.applies_to.household_size_min),
                      household_size_max: und(c.applies_to.household_size_max),
                      income_type: und(c.applies_to.income_type),
                      marriage: und(c.applies_to.marriage),
                    }
                  : {},
                operator: c.operator,
                value: parseValue(c.value_json),
                unit: und(c.unit),
              })),
              apply_date: und(r.apply_date),
              source: r.source,
            })),
          }
        : {}),
      ...(t.selection_order?.length ? { selection_order: t.selection_order } : {}),
      ...(t.residence && (t.residence.contract_years !== null || t.residence.max_years !== null)
        ? { residence: { contract_years: und(t.residence.contract_years), max_years: und(t.residence.max_years), note: und(t.residence.note) } }
        : {}),
    })),
    notes: llm.notes,
  };
  return ExtractionOutput.safeParse(candidate);
}
