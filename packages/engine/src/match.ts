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
  if (app === false) return { rule, status: "MATCH", skipped: true, reason: "이 조건은 내 가구 유형에 해당하지 않음" };
  if (app === null) return { rule, status: "NEEDS_CHECK", skipped: false, reason: "가구원 수·맞벌이 여부를 입력하면 판별 가능" };
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
export function regionGuard(
  track: TrackResult,
  profile: UserProfile,
  announcementRegion: string | undefined,
): TrackResult {
  if (!announcementRegion || !profile.region_code) return track;
  if (announcementRegion === profile.region_code) return track;
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
    reason: "공고문에서 거주 요건을 읽지 못했어요. 지역이 달라 신청 가능한지 공고문을 확인해 주세요.",
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
  };
}

export function matchAnnouncement(
  extraction: Pick<ExtractionOutput, "tracks">,
  profile: UserProfile,
  options: MatchOptions = {},
): AnnouncementMatch {
  const tracks = extraction.tracks
    .map((t) => matchTrack(t, profile))
    .map((t) => regionGuard(t, profile, options.announcement_region));
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
