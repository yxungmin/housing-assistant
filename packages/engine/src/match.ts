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

/** 프로필에서 category에 대응하는 값을 꺼낸다. 없으면 undefined → NEEDS_CHECK. */
export function profileValueFor(
  category: RuleCategory,
  profile: UserProfile,
  unit?: string,
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
    case "residence":
      return profile.region_code;
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
      return profile.age;
    case "subscription":
      if (unit === "count") return profile.subscription_deposits;
      return profile.subscription_months;
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
  group: RuleGroup;
  status: MatchStatus;
  rules: RuleResult[];
}

export interface TrackResult {
  track: SupplyTrack;
  groups: GroupResult[];
  summary: { matched: number; needs_check: number; mismatched: number };
}

export interface AnnouncementMatch {
  tracks: TrackResult[];
  /** mismatched가 0이면서 matched가 가장 많은 트랙. 없으면 null. */
  best_track: TrackResult | null;
  /** 홈 목록에서 "조건에 맞는 공고"로 셀지 */
  is_match: boolean;
}

function evaluateRule(rule: EligibilityRule, profile: UserProfile): RuleResult {
  const app = applies(rule.applies_to, profile);
  if (app === false) return { rule, status: "MATCH", skipped: true, reason: "이 조건은 내 가구 유형에 해당하지 않음" };
  if (app === null) return { rule, status: "NEEDS_CHECK", skipped: false, reason: "가구원 수·맞벌이 여부를 입력하면 판별 가능" };
  if (!rule.verified) return { rule, status: "NEEDS_CHECK", skipped: false, reason: "공고 조건 검수 전" };
  const actual = profileValueFor(rule.category, profile, rule.unit);
  if (actual === undefined || actual === null) {
    return { rule, status: "NEEDS_CHECK", skipped: false, reason: "입력하면 판별 가능" };
  }
  const ok = compare(actual, rule.operator, rule.value);
  return { rule, status: ok ? "MATCH" : "MISMATCH", skipped: false, reason: ok ? "조건 일치" : "조건 불일치" };
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
    groups.push({ group, status: combine(group.mode, counted.map((r) => r.status)), rules });
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

export function matchAnnouncement(
  extraction: Pick<ExtractionOutput, "tracks">,
  profile: UserProfile,
): AnnouncementMatch {
  const tracks = extraction.tracks.map((t) => matchTrack(t, profile));
  const candidates = tracks.filter((t) => t.summary.mismatched === 0);
  candidates.sort((a, b) => b.summary.matched - a.summary.matched || a.summary.needs_check - b.summary.needs_check);
  const best = candidates[0] ?? null;
  return { tracks, best_track: best, is_match: best !== null };
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
