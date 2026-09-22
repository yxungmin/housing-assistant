import type { UserProfile } from "@housing/schema";
import { ageFromBirthDate, homelessBasis, homelessBasisReason } from "@housing/engine";
import { isServiceRegion, SERVICE_REGION_LABEL } from "@housing/schema";
import { parsePlaceLabel, placeFor } from "./places";
import { REGION_LIST, regionByCode, sigunguValue } from "./regions";

/** duration: 년 + 개월(선택) 두 칸으로 받아 개월 수로 저장 */
export type StepKind = "select" | "multi" | "won" | "count" | "age" | "months" | "duration" | "date" | "skip-info" | "place";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface Step {
  id: string;
  kind: StepKind;
  title: string | ((p: Partial<UserProfile>) => string);
  hint?: string | ((p: Partial<UserProfile>) => string);
  helper?: string;
  options?: Option[] | ((p: Partial<UserProfile>) => Option[]);
  optional?: boolean;
  /**
   * 첫 온보딩에서 물을 것인가.
   *
   * 여기 없는 항목은 나중에 공고를 보다가 필요해질 때 그 자리에서 묻는다 —
   * 엔진이 값이 없으면 그 조건을 NEEDS_CHECK로 돌려주므로, 화면이 "입력하면 판별돼요"로 이어 준다.
   * 처음에 스무 개를 물으면 목록을 보기도 전에 지친다. 목록이 쓸모 있어지는 최소치만 받는다.
   */
  core?: boolean;
  /** 이 단계를 보여줄 조건 */
  when?: (p: Partial<UserProfile>) => boolean;
  /** 입력값을 프로필에 반영 */
  apply: (p: Partial<UserProfile>, value: string | number | null) => Partial<UserProfile>;
  /** 프로필에서 현재 값 읽기 */
  read: (p: Partial<UserProfile>) => string | number | null;
}

export const REGIONS: Option[] = REGION_LIST.map((r) => ({ value: r.code, label: r.label }));

export const stepTitle = (s: Step, p: Partial<UserProfile>) => (typeof s.title === "function" ? s.title(p) : s.title);
export const stepHint = (s: Step, p: Partial<UserProfile>) => (typeof s.hint === "function" ? s.hint(p) : s.hint);
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
/** "직장이 없어요" 선택값. 지역 코드와 섞이지 않게 숫자가 아닌 값을 쓴다 */
export const NO_WORKPLACE = "none";

type WorkplaceKey = "workplace" | "workplace_partner";

function workplaceSteps(key: WorkplaceKey, copy: { title: Step["title"]; hint: string; when?: (p: Partial<UserProfile>) => boolean }): Step[] {
  return [
    {
      id: `${key}_place`, kind: "place", title: copy.title, hint: copy.hint, optional: true,
      when: copy.when,
      // 모두가 직장에 다니는 건 아니다. 학생·구직 중·은퇴·육아 전담이면 통근을 물을 이유가 없고,
      // 건너뛰기와도 다르다 — "없다"는 답이고 건너뛰기는 "아직 모르겠다"다.
      options: [{ value: NO_WORKPLACE, label: "직장이 없어요", hint: "학생·구직 중·은퇴 등" }],
      apply: (p, v) => {
        if (v === null) return { ...p, [key]: undefined, [`${key}_none`]: undefined };
        if (v === NO_WORKPLACE) return { ...p, [key]: undefined, [`${key}_none`]: true };
        // "이름|위도|경도" 꼴로 받는다. 화면이 고른 장소를 그대로 넘긴다.
        const [label, lat, lng] = String(v).split("|");
        if (!label || !lat || !lng) return p;
        return { ...p, [key]: { label, lat: Number(lat), lng: Number(lng) }, [`${key}_none`]: undefined };
      },
      read: (p) => {
        if (p[`${key}_none` as keyof UserProfile]) return NO_WORKPLACE;
        const w = p[key];
        return w ? `${w.label ?? ""}|${w.lat}|${w.lng}` : null;
      },
    },
  ];
}

export const STEPS: Step[] = [
  {
    id: "region", core: true, kind: "select", title: "지금 어디에 살고 있나요?",
    // 수집 범위 밖을 고르면 그 자리에서 알린다. 스무 질문을 다 답하고 빈 목록을 보는 것보다 낫다.
    hint: (p) =>
      isServiceRegion(p.region_code)
        ? "공고 대부분이 거주지 기준으로 신청 자격을 봅니다."
        : `공고 대부분이 거주지 기준으로 신청 자격을 봅니다. 다만 지금은 ${SERVICE_REGION_LABEL} 공고만 모으고 있어요 — 고른 지역 공고는 아직 없어요.`,
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
    id: "birth_date", core: true, kind: "date", title: "생년월일을 알려주세요", hint: "공고는 출생일 기준으로 청년·고령자 계층을 나눕니다. 만 나이는 자동으로 계산해요.",
    apply: (p, v) => {
      const s = String(v ?? "").replace(/[^0-9]/g, "");
      if (s.length !== 8) return p;
      const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      return { ...p, birth_date: iso, age: ageFromBirthDate(iso) };
    },
    read: (p) => (p.birth_date ? p.birth_date.replace(/-/g, "") : null),
  },
  {
    id: "marriage", core: true, kind: "select", title: "혼인 상태를 알려주세요",
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
    id: "household_size", core: true, kind: "count", title: "함께 사는 가구원은 몇 명인가요?", hint: "본인을 포함한 세대구성원 수. 소득 기준이 가구원 수마다 다릅니다.",
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
    // 공고는 "월평균소득 100% 이하"처럼 월로 말하지만, 사람은 자기 소득을 연봉으로 기억한다.
    // 그래서 받기는 연봉으로 받고 월로 환산해 판정에 쓴다. 환산값은 화면에 같이 적어 둔다.
    id: "annual_income", core: true, kind: "won", title: "세전 연소득은 얼마인가요?", hint: "세금 떼기 전 1년 총액이에요. 맞벌이면 두 사람 소득을 더해 주세요.",
    helper: "정확한 금액을 모르면 직장 건강보험료 납부액으로 역산해 드려요. 공고의 소득 기준은 월 환산액으로 판정됩니다.",
    apply: (p, v) => {
      const annual = Number(v);
      return { ...p, annual_income: annual, monthly_income: Math.round(annual / 12) };
    },
    // 예전 프로필에는 연소득이 없다. 그때만 월소득에서 되돌린다.
    read: (p) => p.annual_income ?? (p.monthly_income !== undefined ? p.monthly_income * 12 : null),
  },
  {
    id: "total_assets", core: true, kind: "won", title: "가구 총자산은 얼마쯤인가요?", hint: "부동산·자동차·금융자산을 더하고 부채를 뺀 금액. 대략이어도 괜찮아요.",
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
    id: "homeless", core: true, kind: "select", title: "세대구성원 모두 집이 없나요?", hint: "본인·배우자·같이 사는 부모 등 전원이 무주택이어야 하는 공고가 많습니다.",
    options: [{ value: "yes", label: "네, 모두 무주택이에요" }, { value: "no", label: "아니요, 집이 있어요" }],
    apply: (p, v) => ({ ...p, is_homeless: v === "yes", homeless_months: v === "yes" ? p.homeless_months : undefined }),
    read: (p) => (p.is_homeless === undefined ? null : p.is_homeless ? "yes" : "no"),
  },
  {
    // "무주택 몇 년인가요?"는 답하기 어려운 질문이다. 태어나서부터도 아니고 자취 시작일도 아니다.
    // 청약 가점제 규칙이 따로 있어서(만 30세부터, 그 전 혼인이면 혼인신고일부터) 그대로 계산해 채워 둔다.
    // 확정하지는 않는다 — 혼인일을 연 단위로만 알고, 집을 팔았던 사람은 그날부터 다시 세야 한다.
    // 생년월일과 혼인 여부가 있으면 규칙이 값을 정한다. 묻지 않고 알려만 준다 —
    // 물어 놓고 규칙으로 덮어쓰면 적은 사람이 자기 답이 어디 갔는지 알 수 없다.
    id: "homeless_months", kind: "skip-info",
    title: (p) => {
      const months = homelessBasis(p)?.months ?? 0;
      const y = Math.floor(months / 12);
      const m = months % 12;
      const text = months === 0 ? "아직 0이에요" : y === 0 ? `${m}개월이에요` : m === 0 ? `${y}년이에요` : `${y}년 ${m}개월이에요`;
      return `무주택 기간은 ${text}`;
    },
    hint: (p) => {
      const basis = homelessBasis(p);
      return `${basis ? homelessBasisReason(basis) : ""}. 청약 가점제 규칙이라 생년월일과 혼인 정보에서 정해져요. 집을 가졌다 판 적이 있으면 실제 기간은 더 짧을 수 있어요.`.replace(/^\. /, "");
    },
    when: (p) => p.is_homeless === true && homelessBasis(p) !== null,
    apply: (p) => ({ ...p, homeless_months: homelessBasis(p)?.months ?? p.homeless_months }),
    read: (p) => homelessBasis(p)?.months ?? null,
  },
  {
    // 생년월일이 없으면 규칙으로 셀 수 없다. 그때만 직접 받는다.
    id: "homeless_months_manual", kind: "duration", title: "무주택 기간은 얼마나 됐나요?",
    hint: "만 30세부터 세고, 그 전에 혼인했으면 혼인신고일부터예요. 집을 가졌다 판 적이 있으면 판 날부터 다시 세 주세요.",
    when: (p) => p.is_homeless === true && homelessBasis(p) === null,
    apply: (p, v) => ({ ...p, homeless_months: Number(v) }),
    read: (p) => p.homeless_months ?? null,
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
    title: "직장이 어디인가요?",
    hint: "역·회사 이름을 검색하세요. 정확할수록 통근 시간이 맞습니다. 위치는 이 기기에만 저장돼요.",
  }),
  ...workplaceSteps("workplace_partner", {
    title: (p) => (p.marriage === "pre_marriage" ? "예비 배우자 직장은 어디인가요?" : "배우자 직장은 어디인가요?"),
    hint: "두 사람 통근을 같이 봐야 실제로 살 수 있는 집이 골라져요. 건너뛰어도 됩니다.",
    // 본인 직장을 넣은 신혼·예비신혼부부에게만 묻는다. 한 쪽도 안 넣었으면 물을 이유가 없다.
    when: (p) => isCouple(p) && !!p.workplace,
  }),
];

export function visibleSteps(p: Partial<UserProfile>, opts: { coreOnly?: boolean } = {}): Step[] {
  return STEPS.filter((s) => (!opts.coreOnly || s.core) && (!s.when || s.when(p)));
}

/** 아직 안 채운 항목 (나중에 공고에서 유도할 때 쓴다) */
export const pendingSteps = (p: Partial<UserProfile>): Step[] =>
  visibleSteps(p).filter((s) => !s.core && s.read(p) === null);

/**
 * 목록에 쓰는 짧은 이름. 단계의 title은 질문이라("세전 연소득은 얼마인가요?") 목록에 못 쓴다.
 * 단계 객체마다 label을 더하지 않고 여기 한 표에 모은다 — 단계 정의는 질문에만 집중한다.
 */
const STEP_LABEL: Record<string, string> = {
  region: "사는 지역",
  sigungu: "사는 시군구",
  birth_date: "생년월일",
  marriage: "혼인 상태",
  marriage_years: "혼인 기간",
  household_size: "가구원 수",
  children_count: "자녀 수",
  youngest: "막내 나이",
  income_type: "맞벌이 여부",
  annual_income: "가구 연소득",
  total_assets: "총자산",
  car_value: "자동차 가액",
  debt: "월 부채 상환액",
  statuses: "해당 계층",
  homeless: "무주택 여부",
  homeless_months: "무주택 기간",
  homeless_months_manual: "무주택 기간",
  subscription_months: "청약통장 기간",
  subscription_active: "청약통장 납입 중",
  cash: "보유 현금",
  workplace_place: "직장",
  workplace_partner_place: "배우자 직장",
};

export const stepLabel = (s: Step): string => STEP_LABEL[s.id] ?? s.id;

/**
 * "내 조건" 화면의 묶음. 사람이 한 번에 떠올리는 단위로 나눈다 —
 * 단계 순서는 처음 입력할 때의 순서이고, 고칠 때 찾는 순서와는 다르다.
 *
 * 화면이 아니라 여기 두는 이유: 단계 id를 바꿀 때 같이 고쳐야 하는 표라서 옆에 있어야 한다.
 * 실제로 직장 단계를 검색으로 바꾸며 id가 바뀌었을 때 이 표가 옛 id를 들고 있어
 * 직장이 "그 밖에"로 떨어졌다 (2026-09-22). 테스트가 그걸 잡는다.
 */
export const CONDITION_GROUPS: { title: string; ids: string[] }[] = [
  { title: "나와 가구", ids: ["birth_date", "marriage", "marriage_years", "household_size", "children_count", "youngest", "statuses"] },
  { title: "사는 곳과 직장", ids: ["region", "sigungu", "workplace_place", "workplace_partner_place"] },
  { title: "소득과 자산", ids: ["income_type", "annual_income", "total_assets", "car_value", "debt", "cash"] },
  { title: "주택과 청약", ids: ["homeless", "homeless_months", "homeless_months_manual", "subscription_months", "subscription_active"] },
];

/** 단계 id 전부 (테스트가 표들이 최신인지 확인하는 데 쓴다) */
export const STEP_IDS: string[] = STEPS.map((s) => s.id);

/**
 * 규칙으로 정해지는 값을 다시 매긴다. 프로필을 저장할 때마다 한 번 지난다.
 *
 * 무주택 기간이 그렇다. 생년월일과 혼인 여부가 정해지면 청약 가점제 규칙이 값을 정한다 —
 * 사람이 적은 숫자와 규칙이 어긋나면 규칙이 이긴다. 공고를 판정하는 것이 규칙이지 기억이 아니다.
 * 생년월일을 고치면 무주택 기간도 따라 바뀌어야 하는데, 단계마다 챙기게 두면 한 군데만 빠져도 낡은 값이 남는다.
 * 그래서 저장 길목 한 곳에서 계산한다.
 *
 * 생년월일이 없어 셀 수 없으면 사람이 적은 값을 그대로 둔다.
 */
export function withDerived(p: UserProfile): UserProfile {
  if (!p.is_homeless) return p;
  const basis = homelessBasis(p);
  return basis ? { ...p, homeless_months: basis.months } : p;
}

const wonText = (n: number): string => {
  if (n <= 0) return "0원";
  const eok = Math.floor(n / 100_000_000);
  const man = Math.round((n % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString("ko-KR")}만 원` : `${eok}억 원`;
  if (man > 0) return `${man.toLocaleString("ko-KR")}만 원`;
  return `${n.toLocaleString("ko-KR")}원`;
};

const monthsText = (n: number): string => {
  const y = Math.floor(n / 12);
  const m = n % 12;
  if (y === 0) return `${m}개월`;
  return m === 0 ? `${y}년` : `${y}년 ${m}개월`;
};

/**
 * 목록에 보여 줄 현재 값. 아직 안 넣었으면 null이고, 화면이 "입력 안 함"으로 적는다.
 *
 * 단계마다 형식을 따로 적지 않고 kind에서 끌어낸다. 단계가 늘어도 여기를 고칠 일이 거의 없다.
 */
export function stepDisplay(s: Step, p: Partial<UserProfile>): string | null {
  const v = s.read(p);
  if (v === null || v === "") return null;

  if (s.kind === "select") return stepOptions(s, p).find((o) => o.value === String(v))?.label ?? String(v);
  // 직장은 "이름|위도|경도"로 저장된다. 목록에는 이름만 보여 준다.
  if (s.kind === "place") return v === NO_WORKPLACE ? "직장 없음" : String(v).split("|")[0] || null;
  if (s.kind === "multi") {
    const picked = String(v).split(",").filter(Boolean);
    if (picked.length === 0) return "해당 없음";
    const options = stepOptions(s, p);
    return picked.map((x) => options.find((o) => o.value === x)?.label ?? x).join(" · ");
  }
  if (s.kind === "date") {
    const d = String(v);
    return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d;
  }

  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (s.kind === "won") return wonText(n) + (s.id === "annual_income" ? " / 년" : s.id === "debt" ? " / 월" : "");
  if (s.kind === "count") return s.id === "marriage_years" ? `${n}년` : `${n}명`;
  if (s.kind === "age") return `만 ${n}세`;
  if (s.kind === "months" || s.kind === "duration") return monthsText(n);
  return String(v);
}

/** 그 단계 하나만. 내 조건 목록에서 항목 하나를 눌러 들어올 때 쓴다. */
export const stepById = (p: Partial<UserProfile>, id: string): Step | undefined => visibleSteps(p).find((s) => s.id === id);


/**
 * 목록을 보여 줄 만큼 채워졌는가. core 단계와 같은 집합이다.
 * 현금(cash_on_hand)은 빠졌다 — 비용 계산에만 쓰이고, 없으면 그 자리에서 물으면 된다.
 */
export function isComplete(p: Partial<UserProfile>): p is UserProfile {
  return p.region_code !== undefined && (p.birth_date !== undefined || p.age !== undefined) && p.marriage !== undefined && p.household_size !== undefined && p.monthly_income !== undefined && p.total_assets !== undefined && p.is_homeless !== undefined;
}
