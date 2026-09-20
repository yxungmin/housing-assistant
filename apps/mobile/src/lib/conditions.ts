import type { EligibilityRule, UserProfile } from "@housing/schema";
import { ageFromBirthDate, monthsBetween, type RuleResult } from "@housing/engine";
import { REGIONS } from "./onboarding";
import { manwon, won } from "./format";

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

/** 내 입력값 설명 */
export function inputSummary(r: EligibilityRule, p: UserProfile | null, result: RuleResult): string {
  if (!p) return "";
  if (result.status === "NEEDS_CHECK") return result.reason;
  switch (r.category) {
    case "income": return `입력: ${won(p.monthly_income)}`;
    case "asset": return `입력: ${manwon(p.total_assets)}`;
    case "car_value": return `입력: ${manwon(p.car_value)}`;
    case "debt": return `입력: 월 ${won(p.monthly_debt_payment)}`;
    case "age": return p.birth_date ? `입력: ${p.birth_date.slice(0, 4)}년생 (만 ${ageFromBirthDate(p.birth_date)}세)` : `입력: 만 ${p.age}세`;
    case "marriage": return r.unit === "status" ? `입력: ${MARRIAGE_LABEL[p.marriage ?? ""] ?? "-"}` : `입력: 혼인 ${p.marriage_years ?? 0}년`;
    case "children": return r.unit === "child_age" ? `입력: 자녀 ${p.children_ages?.join(", ") ?? "-"}세` : `입력: 자녀 ${p.children_count ?? 0}명`;
    case "housing": return p.is_homeless ? `입력: 무주택 ${Math.floor((p.homeless_months ?? 0) / 12)}년` : "입력: 유주택";
    case "residence": return `입력: ${p.region_sigungu ?? REGIONS.find((x) => x.value === p.region_code)?.label ?? p.region_code}`;
    case "subscription": {
      const elapsed = p.subscription_active && p.subscription_as_of ? monthsBetween(p.subscription_as_of) : 0;
      return `입력: ${(p.subscription_months ?? 0) + elapsed}개월 · ${(p.subscription_deposits ?? 0) + elapsed}회${p.subscription_active ? " (납입 중, 매달 자동 반영)" : ""}`;
    }
    case "commute": return `입력: ${p.commute_limit_min ?? "-"}분`;
    case "status": return `입력: ${p.statuses?.length ? p.statuses.map((s) => STATUS_LABEL[s] ?? s).join(", ") : "해당 없음"}`;
  }
}
