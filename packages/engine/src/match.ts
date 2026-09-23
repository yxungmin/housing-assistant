import type {
  AppliesTo,
  EligibilityRule,
  ExtractionOutput,
  MatchStatus,
  RuleCategory,
  RuleGroup,
  SupplyTrack,
  UserProfile,
} from "@housing/schema";
import { categoryLabel, missingCategories } from "./omission";

/** 생년월일(YYYY-MM-DD) → 기준일의 만 나이 */
export function ageFromBirthDate(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** fromIso(YYYY-MM-DD)부터 today까지 지난 달수 (해당 일이 안 지났으면 한 달 덜 센다) */
export function monthsBetween(fromIso: string, today = new Date()): number {
  const [y, m, d] = fromIso.split("-").map(Number) as [number, number, number];
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  return Math.max(0, months);
}

/** 프로필에서 category에 대응하는 값을 꺼낸다. 없으면 undefined → NEEDS_CHECK. */
export function profileValueFor(
  category: RuleCategory,
  profile: UserProfile,
  unit?: string,
  today = new Date(),
): number | string | boolean | number[] | string[] | undefined {
  switch (category) {
    case "income":
      return profile.monthly_income;
    case "asset":
      return profile.total_assets;
    case "car_value":
      return profile.car_value;
    case "debt":
      return profile.monthly_debt_payment;
    case "residence": {
      // 룰 값은 시도 코드("41") 또는 "경기 과천시" 형식. 둘 중 하나라도 목록에 있으면 일치.
      const vals = [profile.region_code, profile.region_sigungu].filter((v): v is string => !!v);
      return vals.length ? vals : undefined;
    }
    case "housing":
      if (profile.is_homeless === false) return -1; // 유주택: 어떤 무주택 기간 조건도 불일치
      return profile.homeless_months ?? (profile.is_homeless ? 0 : undefined);
    case "marriage":
      if (unit === "status") return profile.marriage;
      // 혼인 기간 조건: 미혼·한부모는 혼인 중이 아니므로 어떤 "N년 이내(lte)" 조건도 불일치하도록 무한대. 상태를 모르면 NEEDS_CHECK.
      if (profile.marriage === undefined) return undefined;
      if (profile.marriage === "single" || profile.marriage === "single_parent") return Number.POSITIVE_INFINITY;
      return profile.marriage_years ?? (profile.marriage === "pre_marriage" ? 0 : undefined);
    case "children":
      if (unit === "child_age") return profile.children_ages;
      return profile.children_count;
    case "age":
      return profile.birth_date ? ageFromBirthDate(profile.birth_date, today) : profile.age;
    case "subscription": {
      // 납입 중이면 입력일 이후 지난 달수를 더한다 (매달 자동 +1)
      const elapsed = profile.subscription_active && profile.subscription_as_of ? monthsBetween(profile.subscription_as_of, today) : 0;
      if (unit === "count") return profile.subscription_deposits === undefined ? undefined : profile.subscription_deposits + elapsed;
      return profile.subscription_months === undefined ? undefined : profile.subscription_months + elapsed;
    }
    case "commute":
      return profile.commute_limit_min;
    case "status":
      // 빈 배열(해당 없음)은 compare에서 false → MISMATCH. undefined → NEEDS_CHECK.
      return profile.statuses === undefined ? undefined : profile.statuses.length === 0 ? "__none__" : profile.statuses;
  }
}

/** 룰의 applies_to가 이 프로필에 해당하는가. 판정 불가(프로필 값 없음)는 null. */
export function applies(appliesTo: AppliesTo | undefined, profile: UserProfile): boolean | null {
  if (!appliesTo) return true;
  let undetermined = false;
  if (appliesTo.household_size !== undefined) {
    if (profile.household_size === undefined) undetermined = true;
    else if (profile.household_size !== appliesTo.household_size) return false;
  }
  if (appliesTo.household_size_min !== undefined) {
    if (profile.household_size === undefined) undetermined = true;
    else if (profile.household_size < appliesTo.household_size_min) return false;
  }
  if (appliesTo.household_size_max !== undefined) {
    if (profile.household_size === undefined) undetermined = true;
    else if (profile.household_size > appliesTo.household_size_max) return false;
  }
  if (appliesTo.income_type !== undefined) {
    if (profile.income_type === undefined) undetermined = true;
    else if (profile.income_type !== appliesTo.income_type) return false;
  }
  if (appliesTo.marriage !== undefined && appliesTo.marriage.length > 0) {
    if (profile.marriage === undefined) undetermined = true;
    else if (!appliesTo.marriage.includes(profile.marriage)) return false;
  }
  return undetermined ? null : true;
}

/** 값 비교. 배열 프로필 값(자녀 나이)은 하나라도 만족하면 true. */
export function compare(
  actual: number | string | boolean | number[] | string[],
  operator: EligibilityRule["value"] extends never ? never : EligibilityRule["operator"],
  expected: EligibilityRule["value"],
): boolean {
  if (Array.isArray(actual)) {
    if (actual.length === 0) return false;
    return (actual as (number | string)[]).some((a) => compare(a, operator, expected));
  }
  switch (operator) {
    case "eq":
      return actual === expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2 || typeof actual !== "number") return false;
      const [min, max] = expected as [number, number];
      return actual >= min && actual <= max;
    }
    case "in":
      return Array.isArray(expected) && (expected as (string | number)[]).includes(actual as string | number);
    case "is_true":
      return actual === true;
  }
}

export interface RuleResult {
  rule: EligibilityRule;
  status: MatchStatus;
  /** applies_to 때문에 이 사용자에게 해당하지 않아 건너뛴 룰 */
  skipped: boolean;
  reason: string;
}

export interface GroupResult {
  /**
   * any_of인데 **확실히 아닌 갈래가 있고 확실히 맞는 갈래는 없다.**
   *
   * 예: "고령자(만 65세 이상) 또는 장애인 또는 한부모". 생년월일로 65세가 아닌 걸 아는데
   * 장애인 여부는 모르면, 그룹 전체는 NEEDS_CHECK가 된다 — 논리적으로는 맞다(정말 장애인이면 맞으니까).
   * 그런데 그 상태의 트랙을 "조건에 맞는 공고"로 세면, 서른 살에게 65세 공고가 추천된다.
   *
   * 그래서 판정은 그대로 두고 **표시만 따로 한다.** 이런 그룹이 있는 트랙은 추천에서 뺀다.
   * 후보에서 빼는 것이지 감추는 것이 아니다 — 상세 화면은 조건을 다 보여 준다.
   */
  contradicted?: boolean;
  group: RuleGroup;
  status: MatchStatus;
  rules: RuleResult[];
}

export interface TrackResult {
  track: SupplyTrack;
  groups: GroupResult[];
  summary: { matched: number; needs_check: number; mismatched: number };
  /**
   * 거주 요건 안전망이 붙은 트랙인가 (regionGuard 참고).
   * 공고문에서 거주 요건을 못 읽었고 공고 지역이 내가 사는 곳과 다르다는 뜻이다.
   * 불일치라고 단정하지는 않지만 "조건에 맞는 공고"로 세지도 않는다.
   */
  region_guarded?: boolean;
}

export interface AnnouncementMatch {
  tracks: TrackResult[];
  /** mismatched가 0이면서 matched가 가장 많은 트랙. 없으면 null. */
  best_track: TrackResult | null;
  /** 홈 목록에서 "조건에 맞는 공고"로 셀지 */
  is_match: boolean;
  /**
   * 어긋난 조건은 없지만 거주 요건을 확인하지 못했다.
   * 화면은 이걸 "맞는 공고"가 아니라 "다른 지역 공고"로 따로 세운다 —
   * 맞다고도 아니라고도 말하지 않는 자리다.
   */
  region_uncertain: boolean;
}

/**
 * 룰 하나를 프로필과 비교한다.
 *
 * `rule.verified`(사람이 공고문과 대조했는가)는 여기서 보지 않는다.
 * 전에는 검수 전 룰을 전부 NEEDS_CHECK로 만들었는데, 그러면 사람이 보기 전까지 모든 공고가
 * "확인 필요"로만 보여서 자격이 되는 사람에게 공고를 숨기게 된다. 그 오류는 아무도 신고하지 않는다.
 * 검수 여부는 화면에서 사실대로 알리고(자동 확인 / 사람 확인), 판정 자체는 있는 값으로 한다.
 */
function evaluateRule(rule: EligibilityRule, profile: UserProfile): RuleResult {
  const app = applies(rule.applies_to, profile);
  if (app === false) return { rule, status: "MATCH", skipped: true, reason: "내 가구 유형에는 해당하지 않는 조건이에요" };
  if (app === null) return { rule, status: "NEEDS_CHECK", skipped: false, reason: "가구원 수·맞벌이 여부를 입력하면 판별할 수 있어요" };
  const actual = profileValueFor(rule.category, profile, rule.unit);
  if (actual === undefined || actual === null) {
    return { rule, status: "NEEDS_CHECK", skipped: false, reason: "입력하면 판별할 수 있어요" };
  }
  const ok = compare(actual, rule.operator, rule.value);
  return { rule, status: ok ? "MATCH" : "MISMATCH", skipped: false, reason: ok ? "조건이 맞아요" : "조건이 어긋나요" };
}

function combine(mode: RuleGroup["mode"], statuses: MatchStatus[]): MatchStatus {
  if (statuses.length === 0) return "MATCH";
  if (mode === "any_of") {
    if (statuses.includes("MATCH")) return "MATCH";
    if (statuses.includes("NEEDS_CHECK")) return "NEEDS_CHECK";
    return "MISMATCH";
  }
  if (statuses.includes("MISMATCH")) return "MISMATCH";
  if (statuses.includes("NEEDS_CHECK")) return "NEEDS_CHECK";
  return "MATCH";
}

export function matchTrack(track: SupplyTrack, profile: UserProfile): TrackResult {
  const byGroup = new Map<string, EligibilityRule[]>();
  for (const rule of track.rules) {
    const list = byGroup.get(rule.group_id) ?? [];
    list.push(rule);
    byGroup.set(rule.group_id, list);
  }
  const groups: GroupResult[] = [];
  for (const group of track.rule_groups) {
    const rules = (byGroup.get(group.id) ?? []).map((r) => evaluateRule(r, profile));
    // applies_to로 건너뛴 룰은 집계에서 제외한다. 그룹 전체가 건너뛰어졌으면 그룹도 제외.
    const counted = rules.filter((r) => !r.skipped);
    if (counted.length === 0 && rules.length > 0) continue;
    const status = combine(group.mode, counted.map((r) => r.status));
    const contradicted =
      group.mode === "any_of" && counted.some((r) => r.status === "MISMATCH") && !counted.some((r) => r.status === "MATCH");
    groups.push({ group, status, rules, ...(contradicted ? { contradicted: true } : {}) });
  }
  // 정의되지 않은 그룹을 가리키는 룰은 스키마 검증에서 걸러지지만, 방어적으로 all_of로 취급한다.
  for (const [groupId, rules] of byGroup) {
    if (track.rule_groups.some((g) => g.id === groupId)) continue;
    const evaluated = rules.map((r) => evaluateRule(r, profile)).filter((r) => !r.skipped);
    if (evaluated.length === 0) continue;
    groups.push({
      group: { id: groupId, mode: "all_of", label: groupId },
      status: combine("all_of", evaluated.map((r) => r.status)),
      rules: evaluated,
    });
  }
  const summary = { matched: 0, needs_check: 0, mismatched: 0 };
  for (const g of groups) {
    if (g.status === "MATCH") summary.matched++;
    else if (g.status === "NEEDS_CHECK") summary.needs_check++;
    else summary.mismatched++;
  }
  return { track, groups, summary };
}


/**
 * 트랙의 규칙 단위 집계 ("조건 8개 중 7개 일치"). applies_to로 건너뛴 규칙은 세지 않는다.
 * any_of 그룹은 통과했으면 그 안의 불일치 규칙을 세지 않는다 — 하나만 맞으면 되는 자리다.
 *
 * 일치 판정 자체(is_match)는 그룹 단위로 하고, 이건 화면에 적는 숫자다. 둘은 다른 질문에 답한다.
 */
export function ruleCounts(track: TrackResult): { matched: number; needsCheck: number; total: number } {
  let matched = 0;
  let needsCheck = 0;
  let total = 0;
  for (const g of track.groups) {
    const rules = g.rules.filter((r) => !r.skipped);
    if (g.group.mode === "any_of" && g.status === "MATCH") {
      matched += 1;
      total += 1;
      continue;
    }
    for (const r of rules) {
      total += 1;
      if (r.status === "MATCH") matched += 1;
      else if (r.status === "NEEDS_CHECK") needsCheck += 1;
    }
  }
  return { matched, needsCheck, total };
}

export interface MatchOptions {
  /**
   * 공고가 속한 시도 코드. API 메타에서 오는 값이라 추출 결과와 달리 확실하다.
   * 추출된 거주지 룰이 하나도 없을 때 이 값으로 안전망을 친다 (regionGuard 참고).
   */
  announcement_region?: string;
}

/**
 * 거주 요건 안전망.
 *
 * 왜 필요한가: 공공임대는 해당 시·도 거주(또는 소재 직장·학교)를 거의 항상 요구하는데,
 * 추출이 그 룰을 빠뜨리면 조용히 "전부 일치"가 된다.
 * 실제로 제주 행복주택 공고에서 거주지 룰이 통째로 빠져, 서울 사는 사람에게
 * "조건 7개 중 7개 일치"로 떴다. 454km 떨어진 집이다.
 *
 * 추출은 LLM이라 언제든 빠질 수 있다. 반면 공고의 시도 코드는 기관 API에서 오는 확실한 값이다.
 * 그래서 트랙에 거주지 룰이 하나도 없고 공고 지역이 내 거주지와 다르면 "확인 필요"를 하나 얹는다.
 *
 * MISMATCH로 잘라내지 않는 이유: 전국 모집이거나 거주 요건이 없는 공고도 있다.
 * 자격이 되는 사람에게 공고를 감추면 그 오류는 아무도 신고하지 못한다.
 * 대신 "맞는다"고 단정하지도 않는다.
 */
/**
 * 한 생활권으로 묶어 보는 지역들.
 *
 * 수도권 공공임대의 거주 요건은 대개 "해당 시·도 또는 수도권 거주"다. 서울 사는 사람에게
 * 과천(8km) 공고를 "다른 지역"으로 빼면 실제로 신청할 수 있는 집을 감추게 된다.
 * 시뮬레이션에서 이게 드러났다(2026-09-21) — 서울 프로필 전부에서 과천 공고가 빠졌다.
 *
 * 묶지 않은 시도는 시도 단위로 본다. 제주·경남처럼 멀리 떨어진 곳은 그래야 한다.
 */
const REGION_CLUSTERS: string[][] = [["11", "28", "41"]];

const sameCluster = (a: string, b: string): boolean =>
  a === b || REGION_CLUSTERS.some((c) => c.includes(a) && c.includes(b));

export function regionGuard(
  track: TrackResult,
  profile: UserProfile,
  announcementRegion: string | undefined,
): TrackResult {
  if (!announcementRegion || !profile.region_code) return track;
  if (sameCluster(announcementRegion, profile.region_code)) return track;
  const hasResidenceRule = track.groups.some((g) => g.rules.some((r) => !r.skipped && r.rule.category === "residence"));
  if (hasResidenceRule) return track;

  const guard: RuleResult = {
    rule: {
      group_id: "__region_guard__",
      category: "residence",
      applies_to: {},
      operator: "in",
      value: [announcementRegion],
      source: { page: 0, text: "공고문에서 거주 요건을 읽지 못했어요. 공고 지역과 사는 곳이 달라 확인이 필요해요." },
      confidence: 0,
      verified: false,
    },
    status: "NEEDS_CHECK",
    reason: "공고문에서 거주 요건을 읽지 못했어요. 지역이 달라 신청할 수 있는지 공고문을 확인해 주세요.",
    skipped: false,
  };
  const groups = [
    ...track.groups,
    { group: { id: "__region_guard__", mode: "all_of" as const, label: "거주 요건" }, status: "NEEDS_CHECK" as const, rules: [guard] },
  ];
  return {
    ...track,
    groups,
    summary: { ...track.summary, needs_check: track.summary.needs_check + 1 },
    region_guarded: true,
  };
}

/**
 * 소득·자산 요건 안전망.
 *
 * 공공임대는 소득과 자산 상한이 거의 언제나 있다. 그런데 추출이 그 표를 못 읽으면
 * 규칙이 한두 개만 남고, 그 한두 개를 맞춘 사람에게 "조건 1개 중 1개 일치"라는
 * 완벽한 초록 태그가 붙는다.
 *
 * 시뮬레이션에서 실제로 나왔다(2026-09-21): 강서염창 우선공급 트랙의 규칙이 「무주택세대구성원」
 * 하나뿐이라, 자산 9억 원 맞벌이 가구에게도 "조건 1개 중 1개 일치"로 떴다.
 *
 * 그래서 소득 규칙이 하나도 없는 임대 트랙에는 "확인 필요"를 한 줄 얹는다.
 * 지역 안전망과 달리 후보에서 빼지는 않는다 — 소득 상한은 사람마다 걸리고 안 걸리고가 갈려서,
 * 우리가 모른다는 이유로 모두에게서 감출 일이 아니다. 대신 완벽해 보이지 않게 만든다.
 */
export function incomeGuard(track: TrackResult): TrackResult {
  const isRental = track.track.pricing.some((p) => p.kind === "rental");
  if (!isRental) return track;
  const hasIncomeRule = track.groups.some((g) => g.rules.some((r) => !r.skipped && r.rule.category === "income"));
  if (hasIncomeRule) return track;

  const guard: RuleResult = {
    rule: {
      group_id: "__income_guard__",
      category: "income",
      applies_to: {},
      operator: "lte",
      value: 0,
      source: { page: 0, text: "공고문에서 소득 기준을 읽지 못했어요." },
      confidence: 0,
      verified: false,
    },
    status: "NEEDS_CHECK",
    reason: "공고문에서 소득 기준을 읽지 못했어요. 공공임대는 소득 상한이 거의 항상 있으니 공고문을 확인해 주세요.",
    skipped: false,
  };
  return {
    ...track,
    groups: [
      ...track.groups,
      { group: { id: "__income_guard__", mode: "all_of" as const, label: "소득 기준" }, status: "NEEDS_CHECK" as const, rules: [guard] },
    ],
    summary: { ...track.summary, needs_check: track.summary.needs_check + 1 },
  };
}

/**
 * 형제 트랙이 가진 조건이 이 트랙에만 없을 때 "확인 필요"를 얹는다.
 *
 * `incomeGuard`와 같은 자리에 서지만 근거가 다르다 — 저쪽은 우리가 미리 적어 둔 도메인 지식이고,
 * 이쪽은 **그 공고문 안의 다른 트랙**이라는 증거다. 그래서 우리가 예상하지 못한 조건도 잡는다.
 *
 * 후보에서 빼지는 않는다. 그 트랙만의 특칙일 수도 있고, 우리가 모른다는 이유로 공고를 감추면
 * 그 오류는 아무도 신고하지 못한다. 대신 완벽해 보이지 않게 만든다 —
 * 조건을 못 읽은 트랙에 "8개 중 8개 일치"가 붙지 않게.
 */
export function siblingGuard(track: TrackResult, missing: RuleCategory[]): TrackResult {
  if (missing.length === 0) return track;
  const groups = [...track.groups];
  for (const category of missing) {
    const label = categoryLabel(category);
    const guard: RuleResult = {
      rule: {
        group_id: `__sibling_guard__${category}`,
        category,
        applies_to: {},
        operator: "in",
        value: [],
        source: { page: 0, text: `공고문에서 이 공급 유형의 ${label}을 읽지 못했어요.` },
        confidence: 0,
        verified: false,
      },
      status: "NEEDS_CHECK",
      reason: `같은 공고의 다른 공급 유형에는 ${label}이 있는데 여기서는 읽지 못했어요. 공고문을 확인해 주세요.`,
      skipped: false,
    };
    groups.push({
      group: { id: `__sibling_guard__${category}`, mode: "all_of" as const, label },
      status: "NEEDS_CHECK" as const,
      rules: [guard],
    });
  }
  return { ...track, groups, summary: { ...track.summary, needs_check: track.summary.needs_check + missing.length } };
}

export function matchAnnouncement(
  extraction: Pick<ExtractionOutput, "tracks">,
  profile: UserProfile,
  options: MatchOptions = {},
): AnnouncementMatch {
  // 빠진 조건은 트랙끼리 비교해야 보인다 — 트랙 하나만 들여다봐서는 없는 것을 알 수 없다
  const missing = missingCategories(extraction);
  const tracks = extraction.tracks
    .map((t) => matchTrack(t, profile))
    .map((t) => regionGuard(t, profile, options.announcement_region))
    .map(incomeGuard)
    .map((t, i) => siblingGuard(t, missing[i] ?? []));
  const byFit = (a: TrackResult, b: TrackResult) => b.summary.matched - a.summary.matched || a.summary.needs_check - b.summary.needs_check;
  const clean = tracks.filter((t) => t.summary.mismatched === 0).sort(byFit);
  // 거주 요건을 확인 못 한 트랙은 후보에서 뺀다.
  //
  // 시뮬레이션으로 확인한 것(2026-09-21): 안전망을 "확인 필요" 한 줄로만 두면
  // 서울 사는 사람 프로필 열 개 중 여덟 개에서 제주 공고(443km)가 "조건 일치"로 떴다.
  // 어긋난 조건이 없다는 것과 조건에 맞는다는 것은 다른 말인데, 화면은 뒤를 말하고 있었다.
  //
  // 그래도 MISMATCH로 자르지는 않는다. 전국 모집도 있고, 자격이 되는 사람에게서 공고를 감추면
  // 그 오류는 아무도 신고하지 못한다. best_track은 그대로 둬서 상세 화면이 조건을 다 보여 준다.
  /*
   * 모순된 any_of 그룹이 있는 트랙은 추천하지 않는다.
   * "어긋난 게 없다"와 "맞는다"는 다른 말이다 — 지역 안전망에서 이미 같은 판단을 했다.
   * 여기서 빼지 않으면 서른 살에게 "만 65세 이상" 공고가 "조건에 맞는 공고"로 나간다.
   */
  const candidates = clean.filter((t) => !t.region_guarded && !t.groups.some((g) => g.contradicted));
  const best = candidates[0] ?? clean[0] ?? null;
  return {
    tracks,
    best_track: best,
    is_match: candidates.length > 0,
    region_uncertain: candidates.length === 0 && clean.length > 0,
  };
}

/** 위경도 두 점의 직선거리 (km). API 실패 시 통근 조건 대체 표시용. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
