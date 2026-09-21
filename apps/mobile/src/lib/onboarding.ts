import type { UserProfile } from "@housing/schema";
import { ageFromBirthDate } from "@housing/engine";
import { parsePlaceLabel, placeFor } from "./places";
import { REGION_LIST, regionByCode, sigunguValue } from "./regions";

/** duration: 년 + 개월(선택) 두 칸으로 받아 개월 수로 저장 */
export type StepKind = "select" | "multi" | "won" | "count" | "age" | "months" | "duration" | "date" | "skip-info";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface Step {
  id: string;
  kind: StepKind;
  title: string | ((p: Partial<UserProfile>) => string);
  hint?: string;
  helper?: string;
  options?: Option[] | ((p: Partial<UserProfile>) => Option[]);
  optional?: boolean;
  /** 이 단계를 보여줄 조건 */
  when?: (p: Partial<UserProfile>) => boolean;
  /** 입력값을 프로필에 반영 */
  apply: (p: Partial<UserProfile>, value: string | number | null) => Partial<UserProfile>;
  /** 프로필에서 현재 값 읽기 */
  read: (p: Partial<UserProfile>) => string | number | null;
}

export const REGIONS: Option[] = REGION_LIST.map((r) => ({ value: r.code, label: r.label }));

export const stepTitle = (s: Step, p: Partial<UserProfile>) => (typeof s.title === "function" ? s.title(p) : s.title);
export const stepOptions = (s: Step, p: Partial<UserProfile>) => (typeof s.options === "function" ? s.options(p) : s.options ?? []);

const isCouple = (p: Partial<UserProfile>) => p.marriage === "married" || p.marriage === "pre_marriage";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * 직장 위치 두 단계(시도 → 시군구). 본인과 배우자가 같은 모양이라 한 곳에서 만든다.
 * 주소 검색 대신 시군구 선택으로 받는다 — 정확한 주소는 통근 계산에 필요한 만큼보다 많이 알게 된다.
 */
type WorkplaceKey = "workplace" | "workplace_partner";

function workplaceSteps(key: WorkplaceKey, copy: { title: Step["title"]; hint: string; when?: (p: Partial<UserProfile>) => boolean }): Step[] {
  const cur = (p: Partial<UserProfile>) => parsePlaceLabel(p[key]?.label);
  return [
    {
      id: `${key}_region`, kind: "select", title: copy.title, hint: copy.hint, optional: true,
      when: copy.when,
      options: REGIONS,
      apply: (p, v) => {
        if (v === null) return { ...p, [key]: undefined };
        const c = cur(p);
        return { ...p, [key]: placeFor(String(v), c?.regionCode === String(v) ? c.sigungu : undefined) ?? undefined };
      },
      read: (p) => cur(p)?.regionCode ?? null,
    },
    {
      id: `${key}_sigungu`, kind: "select",
      title: (p) => `${regionByCode(cur(p)?.regionCode)?.label ?? ""} 어느 시·군·구인가요?`,
      hint: "구청·시청 부근을 기준으로 직선거리를 계산해요.",
      when: (p) => {
        if (copy.when && !copy.when(p)) return false;
        const code = cur(p)?.regionCode;
        return !!code && (regionByCode(code)?.sigungu.length ?? 0) > 1;
      },
      options: (p) => (regionByCode(cur(p)?.regionCode)?.sigungu ?? []).map((s) => ({ value: s, label: s })),
      apply: (p, v) => {
        const code = cur(p)?.regionCode;
        if (!code || v === null) return p;
        return { ...p, [key]: placeFor(code, String(v)) ?? p[key] };
      },
      read: (p) => cur(p)?.sigungu ?? null,
    },
  ];
}

export const STEPS: Step[] = [
  {
    id: "region", kind: "select", title: "지금 어디에 살고 있나요?", hint: "공고 대부분이 거주지 기준으로 신청 자격을 봅니다.",
    options: REGIONS,
    apply: (p, v) => ({ ...p, region_code: String(v), region_sigungu: p.region_code === String(v) ? p.region_sigungu : undefined }),
    read: (p) => p.region_code ?? null,
  },
  {
    id: "sigungu", kind: "select",
    title: (p) => `${regionByCode(p.region_code)?.label ?? ""} 어느 시·군·구인가요?`,
    hint: "우선공급은 해당 시·군·구 거주자에게 주는 경우가 많아요.",
    when: (p) => !!p.region_code && (regionByCode(p.region_code)?.sigungu.length ?? 0) > 1,
    options: (p) => (regionByCode(p.region_code)?.sigungu ?? []).map((s) => ({ value: s, label: s })),
    apply: (p, v) => ({ ...p, region_sigungu: v === null ? undefined : sigunguValue(p.region_code ?? "", String(v)) }),
    read: (p) => (p.region_sigungu ? p.region_sigungu.split(" ").slice(1).join(" ") : null),
  },
  {
    id: "birth_date", kind: "date", title: "생년월일을 알려주세요", hint: "공고는 출생일 기준으로 청년·고령자 계층을 나눕니다. 만 나이는 자동으로 계산해요.",
    apply: (p, v) => {
      const s = String(v ?? "").replace(/[^0-9]/g, "");
      if (s.length !== 8) return p;
      const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      return { ...p, birth_date: iso, age: ageFromBirthDate(iso) };
    },
    read: (p) => (p.birth_date ? p.birth_date.replace(/-/g, "") : null),
  },
  {
    id: "marriage", kind: "select", title: "혼인 상태를 알려주세요",
    options: [
      { value: "single", label: "미혼" }, { value: "married", label: "기혼" },
      { value: "pre_marriage", label: "예비 신혼부부", hint: "입주 전까지 혼인 예정" }, { value: "single_parent", label: "한부모" },
    ],
    apply: (p, v) => ({ ...p, marriage: v as UserProfile["marriage"], marriage_years: v === "pre_marriage" ? 0 : p.marriage_years, income_type: v === "single" || v === "single_parent" ? "single" : p.income_type }),
    read: (p) => p.marriage ?? null,
  },
  {
    id: "marriage_years", kind: "count", title: "혼인한 지 몇 년 됐나요?", hint: "신혼부부 기준은 보통 7년 이내입니다. 1년 미만이면 0.",
    when: (p) => p.marriage === "married",
    apply: (p, v) => ({ ...p, marriage_years: Number(v) }), read: (p) => p.marriage_years ?? null,
  },
  {
    id: "household_size", kind: "count", title: "함께 사는 가구원은 몇 명인가요?", hint: "본인을 포함한 세대구성원 수. 소득 기준이 가구원 수마다 다릅니다.",
    apply: (p, v) => ({ ...p, household_size: Number(v) }), read: (p) => p.household_size ?? null,
  },
  {
    id: "children_count", kind: "count", title: "자녀는 몇 명인가요?", hint: "없으면 0. 태아도 포함합니다.",
    apply: (p, v) => ({ ...p, children_count: Number(v), children_ages: Number(v) === 0 ? [] : p.children_ages }), read: (p) => p.children_count ?? null,
  },
  {
    id: "youngest", kind: "age", title: "가장 어린 자녀는 몇 살인가요?", hint: "6세 이하 자녀가 있으면 신혼부부 계층에 들어갈 수 있어요. 태아는 0.",
    when: (p) => (p.children_count ?? 0) > 0,
    apply: (p, v) => ({ ...p, children_ages: [Number(v)] }), read: (p) => p.children_ages?.[0] ?? null,
  },
  {
    id: "income_type", kind: "select", title: "두 분 모두 소득이 있나요?", hint: "맞벌이는 소득 상한이 더 높습니다.",
    when: isCouple,
    options: [{ value: "dual", label: "맞벌이" }, { value: "single", label: "외벌이" }],
    apply: (p, v) => ({ ...p, income_type: v as UserProfile["income_type"] }), read: (p) => p.income_type ?? null,
  },
  {
    id: "monthly_income", kind: "won", title: "한 달 가구 소득은 얼마인가요?", hint: "세금 떼기 전 금액이에요. 맞벌이면 두 사람 소득을 더해 주세요.",
    helper: "정확한 금액을 모르면 직장 건강보험료 납부액으로 역산해 드려요. 공고의 소득 기준이 이 값으로 판정됩니다.",
    apply: (p, v) => ({ ...p, monthly_income: Number(v) }), read: (p) => p.monthly_income ?? null,
  },
  {
    id: "total_assets", kind: "won", title: "가구 총자산은 얼마쯤인가요?", hint: "부동산·자동차·금융자산을 더하고 부채를 뺀 금액. 대략이어도 괜찮아요.",
    apply: (p, v) => ({ ...p, total_assets: Number(v) }), read: (p) => p.total_assets ?? null,
  },
  {
    id: "car_value", kind: "won", title: "자동차가 있다면 가액은 얼마인가요?", hint: "없으면 0. 나중에 입력해도 됩니다.", optional: true,
    apply: (p, v) => ({ ...p, car_value: v === null ? undefined : Number(v) }), read: (p) => p.car_value ?? null,
  },
  {
    id: "debt", kind: "won", title: "매달 갚는 대출이 있나요?", hint: "월 상환액. 없으면 0. 주거비 부담률 계산에 씁니다.", optional: true,
    apply: (p, v) => ({ ...p, monthly_debt_payment: v === null ? undefined : Number(v) }), read: (p) => p.monthly_debt_payment ?? null,
  },
  {
    id: "statuses", kind: "multi", title: "해당하는 것이 있나요?", hint: "공고의 계층(대학생·수급자 등) 자격을 판별하는 데 씁니다. 없으면 '해당 없음'.",
    options: [
      { value: "student", label: "대학생·입복학 예정" }, { value: "job_seeker", label: "취업준비생", hint: "졸업·중퇴 2년 이내" },
      { value: "new_worker", label: "사회초년생", hint: "소득 있는 일 5년 이내" }, { value: "artist", label: "예술인" },
      { value: "welfare_recipient", label: "주거급여 수급자" }, { value: "basic_livelihood", label: "생계·의료급여 수급자" },
      { value: "national_merit", label: "국가유공자" }, { value: "disabled", label: "장애인 등록" },
      { value: "nk_defector", label: "북한이탈주민" }, { value: "single_parent_support", label: "한부모가족 지원대상" },
      { value: "elderly_care", label: "65세 이상 부모 부양" }, { value: "creator", label: "창작자" },
    ],
    apply: (p, v) => ({ ...p, statuses: v === null ? [] : String(v).split(",").filter(Boolean) as UserProfile["statuses"] }),
    read: (p) => (p.statuses === undefined ? null : p.statuses.join(",")),
  },
  {
    id: "homeless", kind: "select", title: "세대구성원 모두 집이 없나요?", hint: "본인·배우자·같이 사는 부모 등 전원이 무주택이어야 하는 공고가 많습니다.",
    options: [{ value: "yes", label: "네, 모두 무주택이에요" }, { value: "no", label: "아니요, 집이 있어요" }],
    apply: (p, v) => ({ ...p, is_homeless: v === "yes", homeless_months: v === "yes" ? p.homeless_months : undefined }),
    read: (p) => (p.is_homeless === undefined ? null : p.is_homeless ? "yes" : "no"),
  },
  {
    id: "homeless_months", kind: "duration", title: "무주택 기간은 얼마나 됐나요?", hint: "년 단위로 적고 필요하면 개월을 더해 주세요. 처음부터 집이 없었으면 나이만큼 적어도 됩니다.",
    when: (p) => p.is_homeless === true,
    apply: (p, v) => ({ ...p, homeless_months: Number(v) }), read: (p) => p.homeless_months ?? null,
  },
  {
    id: "subscription_months", kind: "months", title: "청약통장은 얼마나 넣었나요?", hint: "가입 기간(개월). 없으면 0.",
    apply: (p, v) => ({ ...p, subscription_months: Number(v), subscription_deposits: p.subscription_deposits ?? Number(v), subscription_as_of: todayIso() }),
    read: (p) => p.subscription_months ?? null,
  },
  {
    id: "subscription_active", kind: "select", title: "지금도 매달 넣고 있나요?", hint: "납입 중이면 가입 기간과 납입 횟수를 매달 자동으로 올려 드려요.",
    when: (p) => (p.subscription_months ?? 0) > 0,
    options: [{ value: "yes", label: "네, 매달 넣고 있어요" }, { value: "no", label: "아니요, 중단했어요" }],
    apply: (p, v) => ({ ...p, subscription_active: v === "yes", subscription_as_of: todayIso() }),
    read: (p) => (p.subscription_active === undefined ? null : p.subscription_active ? "yes" : "no"),
  },
  {
    id: "cash", kind: "won", title: "지금 바로 쓸 수 있는 현금은 얼마인가요?", hint: "보증금에 넣을 수 있는 돈. 부족액 계산에 씁니다.",
    apply: (p, v) => ({ ...p, cash_on_hand: Number(v) }), read: (p) => p.cash_on_hand ?? null,
  },
  ...workplaceSteps("workplace", {
    title: "직장은 어느 지역인가요?",
    hint: "직장과 가까운 공고를 먼저 보여드려요. 위치는 기기에만 저장되고, 통근 시간 계산은 지도 연결 후 열립니다.",
  }),
  ...workplaceSteps("workplace_partner", {
    title: (p) => (p.marriage === "pre_marriage" ? "예비 배우자 직장은 어느 지역인가요?" : "배우자 직장은 어느 지역인가요?"),
    hint: "두 사람 통근을 같이 봐야 실제로 살 수 있는 집이 골라져요. 건너뛰어도 됩니다.",
    // 본인 직장을 넣은 신혼·예비신혼부부에게만 묻는다. 한 쪽도 안 넣었으면 물을 이유가 없다.
    when: (p) => isCouple(p) && !!p.workplace,
  }),
];

export function visibleSteps(p: Partial<UserProfile>): Step[] {
  return STEPS.filter((s) => !s.when || s.when(p));
}

export function isComplete(p: Partial<UserProfile>): p is UserProfile {
  return p.region_code !== undefined && (p.birth_date !== undefined || p.age !== undefined) && p.marriage !== undefined && p.household_size !== undefined && p.monthly_income !== undefined && p.total_assets !== undefined && p.is_homeless !== undefined && p.cash_on_hand !== undefined;
}
