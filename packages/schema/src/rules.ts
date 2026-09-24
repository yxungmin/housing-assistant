import { z } from "zod";
import {
  GroupMode,
  HousingType,
  IncomeType,
  MarriageStatus,
  NearbyKind,
  PricingKind,
  RuleCategory,
  RuleOperator,
  SelectionStep,
  VersionStatus,
} from "./enums";

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

/**
 * 연산자별 값. between은 숫자 2개 배열([min, max])이고 EligibilityRule.superRefine이 길이를 검사한다.
 * (z.tuple은 JSON Schema에 items:false를 만들어 Anthropic 구조화 출력이 거부하므로 쓰지 않는다.)
 */
export const RuleValue = z.union([
  z.number(),
  z.string(),
  z.literal(true),
  z.array(z.string()).min(1).describe("in: 허용 값 목록"),
  z.array(z.number()).min(1).describe("between: [min, max] / in: 허용 숫자 목록"),
]);
export type RuleValue = z.infer<typeof RuleValue>;

export const RuleGroup = z.object({
  id: z.string().min(1).describe("트랙 안에서 유일한 그룹 id (예: newlywed_status)"),
  mode: GroupMode,
  label: z.string().min(1).describe("사용자에게 보이는 그룹 이름 (예: 신혼부부 자격)"),
});
export type RuleGroup = z.infer<typeof RuleGroup>;

/**
 * 상한 가산. 공고문은 기본 상한 하나를 적고 "출산자녀 1명 +10%p(총자산 3.79억), 2명 이상 +20%p(4.13억)"을 덧붙인다.
 * 이걸 모르면 출산가구가 기본 상한으로만 판정돼 **자격이 되는데 "불일치"로 공고를 잃는다** (2026-09 번들 8건 중 4건).
 * 가장 큰 가산이 이긴다 (newborn_children_min이 큰 쪽). 금액은 공고문 표의 완화된 상한 그대로.
 */
export const RuleBonus = z.object({
  newborn_children_min: z.number().int().min(1).describe("2023.3.28 이후 출산(입양·태아 포함) 미성년 자녀 수가 이 값 이상이면"),
  value: z.number().describe("완화된 상한 (원 또는 원/월, 룰의 unit과 같음)"),
});
export type RuleBonus = z.infer<typeof RuleBonus>;

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
    /** 상한 가산 (lte 숫자 룰에만) */
    bonuses: z.array(RuleBonus).optional(),
  })
  .superRefine((rule, ctx) => {
    if (rule.bonuses?.length && (rule.operator !== "lte" || typeof rule.value !== "number")) {
      ctx.addIssue({ code: "custom", path: ["bonuses"], message: "가산은 숫자 상한(lte) 룰에만 붙는다" });
    }
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

/**
 * 순위 하나의 조건. EligibilityRule과 같은 모양이지만 그룹·신뢰도 없이 이 순위 안에서만 쓴다.
 * 자격(되느냐)과 순위(되면 몇 번째냐)는 다른 질문이라 섞지 않는다 — 순위 조건이 자격 룰로 들어가면
 * 2순위인 사람이 "조건 불일치"로 공고를 잃는다.
 */
export const RankCondition = z.object({
  category: RuleCategory,
  applies_to: AppliesTo.default({}),
  operator: RuleOperator,
  value: RuleValue,
  unit: z.string().optional(),
});
export type RankCondition = z.infer<typeof RankCondition>;

/**
 * 입주자 선정 순위 (예: 1순위 해당 주택건설지역 거주자 / 2순위 연접 시·군 / 3순위 그 외).
 * 조건이 빈 순위는 "앞 순위에 해당하지 않는 나머지 전부"다.
 */
export const PriorityRank = z.object({
  rank: z.number().int().min(1).max(9).describe("순위 (1 = 1순위)"),
  label: z.string().min(1).max(120).describe("원문 요약 (예: 양산시 거주자)"),
  mode: GroupMode.default("all_of"),
  conditions: z.array(RankCondition).default([]),
  /**
   * 이 순위의 접수일. 순위별로 접수일이 따로 있는 공고에서만 채운다 — 다른 날 접수하면 부적격이다
   * (2026-09 양산 국민임대: 1순위 9/28, 2·3순위 9/29). 기간 전체는 schedule에 있다.
   */
  apply_date: z.string().optional().describe("이 순위의 접수일 YYYY-MM-DD"),
  source: Source,
});
export type PriorityRank = z.infer<typeof PriorityRank>;

export const SupplyTrack = z
  .object({
    name: z.string().min(1).describe("공급 트랙 이름 (예: 신혼부부 우선공급, 일반공급)"),
    households: z.number().int().min(0).optional(),
    unit_types: z.array(UnitType).default([]),
    rule_groups: z.array(RuleGroup).default([]),
    rules: z.array(EligibilityRule).default([]),
    pricing: z.array(Pricing).default([]),
    /** 순위 기준. 순위제가 아닌 공급(추첨만)이면 없다 */
    priority_ranks: z.array(PriorityRank).optional(),
    /** 경쟁 시 선정 순서 (순위 → 배점 → 추첨 …) */
    selection_order: z.array(SelectionStep).optional(),
    /**
     * 얼마나 살 수 있나. "계약 2년, 재계약으로 최장 30년" — 결정에 큰 정보인데 전에는 notes 글에 묻혀 있었다.
     * 계층마다 다르면(청년 10년·고령자 20년) 트랙마다 따로다.
     */
    residence: z
      .object({
        contract_years: z.number().positive().optional().describe("한 번 계약 기간 (년)"),
        max_years: z.number().positive().optional().describe("재계약 포함 최장 거주 기간 (년)"),
        note: z.string().max(120).optional().describe("자녀 수 등으로 달라지면 그 조건 (원문 요약)"),
      })
      .optional(),
  })
  .superRefine((track, ctx) => {
    const ranks = (track.priority_ranks ?? []).map((r) => r.rank);
    if (new Set(ranks).size !== ranks.length) {
      ctx.addIssue({ code: "custom", path: ["priority_ranks"], message: "같은 순위가 두 번 있다" });
    }
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
  /**
   * 서류 단계. 접수 뒤 "서류제출 대상자 발표 → 서류 제출"이 따로 있고, 기간 안에 안 내면 탈락이다.
   * 전에는 notes 글에만 있어 알림을 걸 수 없었다.
   */
  documents_announce: z.string().optional().describe("서류제출 대상자 발표 YYYY-MM-DD"),
  documents_start: z.string().optional().describe("서류 제출 시작 YYYY-MM-DD"),
  documents_end: z.string().optional().describe("서류 제출 마감 YYYY-MM-DD"),
  contract_start: z.string().optional().describe("계약 시작 YYYY-MM-DD"),
  contract_end: z.string().optional().describe("계약 마감 YYYY-MM-DD"),
});
export type Schedule = z.infer<typeof Schedule>;

/**
 * LLM이 공고문 1건에서 채우는 결정론적 스키마. 판단은 하지 않고 구조만 채운다.
 * 수집기는 이 결과를 검증한 뒤 announcement_versions / supply_tracks / rule_groups /
 * eligibility_rules / pricing 테이블로 분해해 저장한다.
 */
/**
 * 접수 방법. "인터넷 불가, 관리사무소 현장접수만"인 공고가 있다 — 모르고 "청약플러스에서 신청하기"를 띄우면 틀린 안내다.
 */
export const Application = z.object({
  online: z.boolean().optional().describe("인터넷·모바일 접수가 되는가"),
  onsite: z.boolean().optional().describe("현장 접수가 되는가"),
  onsite_for: z.string().max(80).optional().describe("현장 접수가 일부 대상에게만 되면 그 대상 (예: 65세 이상·장애인)"),
  place: z.string().max(120).optional().describe("현장 접수 장소"),
  source: Source.optional(),
});
export type Application = z.infer<typeof Application>;

export const ExtractionOutput = z.object({
  title: z.string().min(1),
  housing_type: HousingType,
  address: z.string().optional().describe("단지 주소 (도로명 또는 지번)"),
  schedule: Schedule,
  application: Application.optional(),
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

/**
 * 좌표 주변에서 찾은 것. 직선거리이지 경로가 아니다 — 실제 통근 시간은 교통 API를 붙여야 나온다.
 * 걷는 시간(walk_min)은 거리를 4km/h로 나눈 환산값이라 화면에서도 "약"을 붙여 쓴다.
 *
 * 단지형 공고(Announcement)와 흩어진 집 한 채(SupplyUnit)가 같은 모양을 쓴다.
 * 두 벌로 두면 화면 문구도 두 벌이 되고, 한쪽만 고치는 날이 온다.
 */
export const Transit = z.object({
  nearest_station: z.string().optional().describe('가장 가까운 지하철역. Kakao는 "망원역 6호선"처럼 호선을 붙여 준다'),
  station_walk_min: z.number().optional(),
  station_distance_m: z.number().optional(),
  nearest_bus_stop: z.string().optional(),
  bus_walk_min: z.number().optional(),
  bus_distance_m: z.number().optional(),
});
export type Transit = z.infer<typeof Transit>;

/** 주변 생활 인프라 한 곳. 종류마다 가장 가까운 하나만 담는다 */
export const NearbyPlace = z.object({
  kind: NearbyKind,
  name: z.string(),
  distance_m: z.number(),
});
export type NearbyPlace = z.infer<typeof NearbyPlace>;

/**
 * 매입임대·전세임대가 공급하는 집 한 채.
 *
 * 단지형 공고는 주소가 하나라 Announcement의 lat/lng로 끝나지만, 이 유형은 수십 채가 흩어져 있다.
 * 좌표는 수집할 때 주소마다 한 번 찍어 둔다 — 한 건물에 여러 세대가 있어 주소는 겹치므로
 * 지오코딩 호출은 집 수가 아니라 주소 수만큼이다.
 */
export const SupplyUnit = z.object({
  /** 주소+동+호. 같은 건물의 다른 세대를 구분한다 */
  id: z.string().min(1),
  address: z.string().min(1),
  dong: z.string().optional(),
  ho: z.string().optional(),
  /** 공고문이 붙인 주택군 이름 ("강동암사동(광채빌라)") */
  complex: z.string().optional(),
  /** 연립주택·도시형생활주택·다세대 등 */
  housing_form: z.string().optional(),
  exclusive_area_m2: z.number().optional(),
  total_area_m2: z.number().optional(),
  rooms: z.number().int().optional(),
  /** 지하는 음수 */
  floor: z.number().int().optional(),
  elevator: z.boolean().optional(),
  /** 집을 미리 볼 수 있는지 ("열람불가(계약 전 주택 개방)") */
  viewing: z.string().optional(),
  /**
   * 소득 구간별 임대조건.
   *
   * 매입임대는 같은 집이라도 소득에 따라 월세가 다르다 — 수급자·한부모·차상위는 시세 30%,
   * 그 외(소득 70% 이하)는 40%다. 실제로 같은 집에서 476,370원과 651,800원으로 갈렸다.
   * 한 쪽만 저장하면 대부분의 사람에게 틀린 금액을 보여 주게 된다.
   *
   * 구간마다 "기본"과 "임대료→보증금 최대전환시" 둘이 온다. 전환은 보증금을 올려 월세를 낮춘 값이다.
   */
  rent_options: z
    .array(
      z.object({
        /** 공고문이 쓴 구간 이름 ("수급자, 지원대상 한부모가족, 차상위계층") */
        tier: z.string(),
        /** 보증금을 올려 월세를 낮춘 조건인가 */
        max_conversion: z.boolean(),
        deposit: z.number().int(),
        monthly_rent: z.number().int(),
      }),
    )
    .optional(),
  /** 첫 구간의 기본 조건. rent_options가 있으면 거기서 고르고, 이건 호환용이다 */
  deposit: z.number().int().optional(),
  monthly_rent: z.number().int().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  /**
   * 이 집의 최근접 역·정류장과 주변 시설.
   *
   * 좌표를 찍는 호출(Kakao Local)이 이미 같이 받아 오는 값이다 — 따로 부르지 않는다.
   * 주소마다 한 번이므로 집 수가 아니라 주소 수만큼이고, 같은 건물의 세대는 같은 값을 쓴다.
   */
  transit: Transit.optional(),
  nearby: z.array(NearbyPlace).optional(),
});
export type SupplyUnit = z.infer<typeof SupplyUnit>;

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
  /** 기관의 공고 상세 페이지. 앱은 외부 브라우저로 연다 */
  detail_url: z.string().url().optional(),
  /**
   * 매입임대·전세임대처럼 단지가 아니라 흩어진 개별 주택을 공급하는 공고의 주택 목록.
   *
   * 이 유형은 공고문 본문에 "총 81호"만 있고 주택별 소재지는 별도 엑셀 첨부에 있다.
   * 그 목록이 이 유형의 핵심이다 — 어느 집이 내 직장에서 가까운지가 신청 여부를 가른다.
   * 단지형 공고에는 없다(주소가 하나뿐이라 announcement의 lat/lng로 충분하다).
   */
  units: z.array(SupplyUnit).optional(),
  /**
   * 기관이 공고에 이미지로 붙여 둔 것 (위치도·단지조감도 등).
   * 공고문 PDF에서 우리가 뽑은 그림이 아니라 기관이 이미지 파일로 준 것만 넣는다 —
   * 출처가 분명해야 "이건 공고에 있던 그림"이라고 말할 수 있다.
   * LH는 상세 응답의 dsSbdAhfl에 준다. 없는 공고가 더 많다.
   */
  images: z
    .array(
      z.object({
        kind: z.string().describe('기관이 붙인 구분 ("위치도", "단지조감도")'),
        name: z.string().optional().describe("원본 파일명"),
        url: z.string().url(),
      }),
    )
    .optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  transit: Transit.optional(),
  nearby: z.array(NearbyPlace).optional().describe("주변 생활 인프라. 종류마다 가장 가까운 한 곳만"),
  /**
   * 같은 법정동의 최근 전월세 실거래 요약. 수집할 때 한 번 채운다 (사용자 수와 무관).
   * 보증금이 싼지 비싼지 판단할 맥락을 주려는 것이고, 없으면 화면에서 통째로 감춘다.
   */
  market: z
    .object({
      lawd_cd: z.string(),
      area_from: z.number(),
      area_to: z.number(),
      from: z.string(),
      to: z.string(),
      deals: z.number(),
      jeonse_median: z.number().optional(),
      monthly_deposit_median: z.number().optional(),
      monthly_rent_median: z.number().optional(),
      source: z.string(),
    })
    .optional(),
  /**
   * 같은 단지의 예비입주자 대기현황. "조건은 맞는데 붙을까"에 답하는 값이다.
   * 단지명이 공고 제목과 정확히 같지 않아 못 맞출 때가 많고, 그때는 없는 채로 둔다.
   */
  waiting: z
    .object({
      complex: z.string(),
      households: z.number().optional(),
      rows: z.array(z.object({ unit_type: z.string().optional(), waiting: z.number(), terminated: z.number().optional() })),
      total_waiting: z.number(),
      as_of: z.string().optional(),
      source: z.string(),
    })
    .optional(),
  /**
   * 공급기관이 부르는 단지 이름 (LH 상세의 `dsSbd.LCC_NT_NM`).
   * 지난 회차 결과를 이을 때 쓴다 — 공고 제목에는 단지 꼬리표가 없는 일이 흔하다.
   */
  complex: z.string().optional(),
  /**
   * 같은 단지의 **지난 회차** 결과. "붙을까"에 답하는 값 중 제일 직접적이다.
   *
   * LH 청약플러스 당첨자 발표의 커트라인 파일에서 나온다 (collector/src/lh/cutline.ts).
   * 이번 회차 결과는 접수가 끝난 뒤에나 나오므로, 신청 판단에 쓰려면 지난 회차를 봐야 한다.
   *
   * **화면은 경쟁률보다 순위를 앞세운다.** 공공임대는 순위제라 "7.2대 1"보다
   * "지난번엔 1순위에서 마감됐어요"가 내 순위와 직접 비교된다.
   * 점수(커트라인의 "9점")는 공고마다 배점이 달라 담지 않는다 — 비교할 수 없는 숫자다.
   *
   * 단지명으로 잇기 때문에 틀릴 수 있다. 그래서 `complex`와 `announced_at`을 같이 담아
   * 화면이 "어느 단지의 언제 결과인지"를 밝히게 한다 — 사용자가 틀린 것을 알아볼 수 있어야 한다.
   */
  past_results: z
    .array(
      z.object({
        /** 추첨단위 번호. 회차가 달라도 같은 단지면 같다 */
        unit_no: z.string().optional(),
        /** 단지명 (커트라인 파일의 추첨단위 표기에서) */
        complex: z.string(),
        /** 당첨자 발표일 (YYYY-MM-DD) */
        announced_at: z.string().optional(),
        /** 주택형 */
        draw_type: z.string().optional(),
        households: z.number().optional(),
        applicants: z.number().optional(),
        /** 신청자 ÷ 공급. 공급이 0이면 담지 않는다 */
        competition: z.number().optional(),
        /** 몇 순위에서 마감됐는가 */
        closed_rank: z.number().int().optional(),
      }),
    )
    .optional(),
  /**
   * 시군구 대표 좌표에서 이 단지까지의 대중교통 통근 시간. 키는 "서울 마포구" 형식.
   *
   * 사용자마다 부르지 않고 수집할 때 미리 계산한다. 그래야 두 가지가 된다:
   *  - 호출이 사용자 수에 비례하지 않는다 (공고 1건당 시군구 수만큼, 새 공고에서 한 번)
   *  - 직장 위치가 서버로 나가지 않는다. 앱은 표에서 찾아보기만 한다.
   */
  commute: z.record(z.string(), z.object({ minutes: z.number(), transfers: z.number() })).optional(),
  updated_at: z.string(),
});
export type Announcement = z.infer<typeof Announcement>;
