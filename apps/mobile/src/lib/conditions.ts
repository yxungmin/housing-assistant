import type { EligibilityRule, RuleCategory, UserProfile } from "@housing/schema";
import { ageFromBirthDate, monthsBetween, type RuleResult } from "@housing/engine";
import { REGIONS } from "./onboarding";
import { manwon, won, yearsMonths } from "./format";

const MARRIAGE_LABEL: Record<string, string> = { single: "미혼", married: "기혼", pre_marriage: "예비 신혼부부", single_parent: "한부모" };

export const STATUS_LABEL: Record<string, string> = {
  student: "대학생·입복학 예정",
  job_seeker: "취업준비생",
  new_worker: "사회초년생",
  artist: "예술인",
  welfare_recipient: "주거급여 수급자",
  basic_livelihood: "생계·의료급여 수급자",
  national_merit: "국가유공자",
  disabled: "장애인",
  nk_defector: "북한이탈주민",
  single_parent_support: "한부모가족 지원대상",
  elderly_care: "65세 이상 부모 부양",
  care_leaver: "아동복지시설 퇴소자",
  creator: "창작자",
};

function appliesLabel(r: EligibilityRule): string {
  const a = r.applies_to ?? {};
  const parts: string[] = [];
  if (a.household_size) parts.push(`${a.household_size}인 가구`);
  else if (a.household_size_min || a.household_size_max) parts.push(`${a.household_size_min ?? ""}~${a.household_size_max ?? ""}인 가구`);
  if (a.income_type === "dual") parts.push("맞벌이");
  if (a.income_type === "single") parts.push("외벌이");
  if (a.marriage?.length) parts.push(a.marriage.map((m) => MARRIAGE_LABEL[m] ?? m).join("·"));
  return parts.length ? `${parts.join(" ")} ` : "";
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** 룰 → 사용자에게 보이는 조건 문장. 확정적 표현은 쓰지 않는다. */
export function ruleTitle(r: EligibilityRule): string {
  const v = r.value;
  switch (r.category) {
    case "income":
      return `${appliesLabel(r)}월평균소득 ${won(num(v))} 이하`;
    case "asset":
      return `총자산 ${manwon(num(v))} 이하`;
    case "car_value":
      return `자동차가액 ${manwon(num(v))} 이하`;
    case "debt":
      return `월 부채 상환액 ${won(num(v))} 이하`;
    case "age":
      if (r.operator === "between" && Array.isArray(v)) return `만 ${v[0]}~${v[1]}세`;
      if (r.operator === "gte") return `만 ${num(v)}세 이상`;
      if (r.operator === "lte") return `만 ${num(v)}세 이하`;
      return `나이 조건`;
    case "marriage":
      if (r.unit === "status" && Array.isArray(v)) return `혼인 상태: ${(v as string[]).map((m) => MARRIAGE_LABEL[m] ?? m).join(" 또는 ")}`;
      if (r.operator === "lte") return `혼인 ${num(v)}년 이내`;
      return `혼인 조건`;
    case "children":
      if (r.unit === "child_age") return `만 ${num(v)}세 이하 자녀`;
      if (r.operator === "gte") return `자녀 ${num(v)}명 이상`;
      return `자녀 조건`;
    case "housing":
      if (r.operator === "gte" && num(v) === 0) return "무주택세대구성원";
      return `무주택 기간 ${num(v)}개월 이상`;
    case "residence":
      if (Array.isArray(v)) return `거주지: ${(v as string[]).map((c) => REGIONS.find((x) => x.value === c)?.label ?? c).join(" · ")}`;
      return `거주지 조건`;
    case "subscription":
      if (r.unit === "count") return `청약통장 납입 ${num(v)}회 이상`;
      return `청약통장 가입 ${num(v)}개월 이상`;
    case "commute":
      return `직장까지 ${num(v)}분 이내`;
    case "status":
      return Array.isArray(v) ? (v as string[]).map((s) => STATUS_LABEL[s] ?? s).join(" 또는 ") : "계층 자격";
  }
}

/**
 * 내 조건을 사람이 쓰는 말로. 조건 문장 아래에 한 줄로 붙는다.
 *
 * "입력: 혼인 0년"처럼 값을 그대로 옮기지 않는다. 0년은 혼인을 안 했다는 뜻이고,
 * 자녀 0명은 "자녀 없음"이다. 숫자를 그대로 보여 주면 읽는 사람이 해석을 해야 한다.
 */

/**
 * "입력하면 판별 가능"에서 어느 질문으로 보낼지.
 *
 * 그 줄을 읽은 사람이 할 수 있는 일은 하나뿐인데(값을 넣는 것), 그러려면 내 정보로 나가서
 * 항목을 찾아야 했다. 조건 옆에서 바로 넣고 돌아오면 그 자리에서 판정이 끝난다.
 *
 * 비어 있는 값이 있을 때만 보낸다. 값이 있는데 판별을 못 한 것이라면(공고문을 못 읽은 경우)
 * 사용자가 넣을 것이 없으므로 보내지 않는다 — 눌러도 아무것도 안 바뀌는 버튼은 거짓말이다.
 */
const STEP_FOR_CATEGORY: Partial<Record<RuleCategory, string>> = {
  income: "annual_income",
  asset: "total_assets",
  car_value: "car_value",
  debt: "debt",
  residence: "region",
  housing: "homeless",
  marriage: "marriage",
  children: "children_count",
  age: "birth_date",
  subscription: "subscription_months",
  status: "statuses",
};

/** 그 규칙의 판별에 빠진 값이 있으면, 그것을 받는 단계 id */
export function missingStepFor(rule: EligibilityRule, p: UserProfile | null): string | undefined {
  if (!p) return undefined;

  // applies_to가 판별이 안 되는 경우다. 가구원 수나 맞벌이 여부가 없어서 어느 줄을 볼지 모른다.
  if (rule.applies_to?.household_size !== undefined && p.household_size === undefined) return "household_size";
  if (rule.applies_to?.income_type !== undefined && p.income_type === undefined) return "income_type";

  // 같은 분류라도 무엇이 빠졌느냐에 따라 물을 것이 다르다.
  // 예: 혼인 "상태"는 있는데 혼인 "기간"이 없으면, marriage가 아니라 marriage_years를 물어야 한다.
  // 첫 온보딩에서 기간·세부 항목을 미루기로 했으므로(onboarding.ts의 core) 여기가 그 값들을 받는 자리가 된다.
  const period = rule.unit === "years" || rule.unit === "months";
  if (rule.category === "marriage" && p.marriage !== undefined && period && p.marriage_years === undefined) return "marriage_years";
  if (rule.category === "housing" && p.is_homeless === true && period && p.homeless_months === undefined) return "homeless_months_manual";
  if (rule.category === "children" && p.children_count !== undefined && rule.unit === "child_age" && p.children_ages === undefined) return "youngest";
  // 시군구 단위 거주 요건 (값이 시도 코드보다 긴 문자열이면 시군구를 본다)
  if (rule.category === "residence" && p.region_code !== undefined && p.region_sigungu === undefined) {
    const vals = Array.isArray(rule.value) ? rule.value : [rule.value];
    if (vals.some((v) => typeof v === "string" && v.length > 2)) return "sigungu";
  }

  const missing: Partial<Record<RuleCategory, boolean>> = {
    income: p.monthly_income === undefined,
    asset: p.total_assets === undefined,
    car_value: p.car_value === undefined,
    debt: p.monthly_debt_payment === undefined,
    residence: p.region_code === undefined,
    housing: p.is_homeless === undefined,
    marriage: p.marriage === undefined,
    children: p.children_count === undefined,
    age: p.birth_date === undefined && p.age === undefined,
    subscription: p.subscription_months === undefined,
    status: p.statuses === undefined,
  };
  return missing[rule.category] ? STEP_FOR_CATEGORY[rule.category] : undefined;
}

export function inputSummary(r: EligibilityRule, p: UserProfile | null, result: RuleResult): string {
  if (!p) return "";
  if (result.status === "NEEDS_CHECK") return result.reason;
  switch (r.category) {
    case "income":
      return p.monthly_income ? `내 소득 월 ${manwon(p.monthly_income)}` : "소득 미입력";
    case "asset":
      return `내 자산 ${manwon(p.total_assets)}`;
    case "car_value":
      return !p.car_value ? "자동차 없음" : `내 자동차 ${manwon(p.car_value)}`;
    case "debt":
      return !p.monthly_debt_payment ? "부채 상환 없음" : `매달 갚는 돈 ${won(p.monthly_debt_payment)}`;
    case "age":
      return p.birth_date
        ? `${p.birth_date.slice(0, 4)}년생 · 만 ${ageFromBirthDate(p.birth_date)}세`
        : `만 ${p.age}세`;
    case "marriage": {
      const label = MARRIAGE_LABEL[p.marriage ?? ""] ?? "-";
      if (r.unit === "status") return label;
      // 혼인 기간 0년은 "아직 안 했다"는 뜻이다. 그대로 "0년"이라고 쓰지 않는다
      if (p.marriage === "pre_marriage") return "아직 혼인 전";
      if (!p.marriage_years) return p.marriage === "married" ? "혼인 1년 미만" : label;
      return `혼인 ${p.marriage_years}년째`;
    }
    case "children": {
      const count = p.children_count ?? 0;
      if (count === 0) return "자녀 없음";
      const ages = p.children_ages?.length ? ` · ${p.children_ages.map((a) => `만 ${a}세`).join(", ")}` : "";
      return `자녀 ${count}명${r.unit === "child_age" ? ages : ""}`;
    }
    case "housing":
      return p.is_homeless ? `무주택 ${yearsMonths(p.homeless_months)}째` : "집이 있어요";
    case "residence":
      return `${p.region_sigungu ?? REGIONS.find((x) => x.value === p.region_code)?.label ?? p.region_code} 거주`;
    case "subscription": {
      const elapsed = p.subscription_active && p.subscription_as_of ? monthsBetween(p.subscription_as_of) : 0;
      const months = (p.subscription_months ?? 0) + elapsed;
      if (!months) return "청약통장 없음";
      const deposits = (p.subscription_deposits ?? 0) + elapsed;
      return `청약통장 ${months}개월 · ${deposits}회 납입${p.subscription_active ? " (매달 자동 반영)" : ""}`;
    }
    case "commute":
      return p.commute_limit_min ? `통근 ${p.commute_limit_min}분까지 괜찮아요` : "통근 시간 미입력";
    case "status":
      return p.statuses?.length ? p.statuses.map((s) => STATUS_LABEL[s] ?? s).join(", ") : "해당하는 자격 없음";
  }
}
