/**
 * 게시물에 쓸 **사실**만 공고 데이터에서 뽑는다. LLM 없음.
 *
 * 공식 인스타는 "공고 알림 미디어"다. 사람들이 이 계정을 믿는 이유는 숫자가 맞기 때문이고,
 * 82세대를 28세대로, 9/28을 9/29로 한 번만 올려도 그 신뢰는 돌아오지 않는다.
 * 그래서 대본은 두 층으로 나눈다 — 여기서 만든 사실(코드, 근거 있음)과, 그걸로 쓴 문장(템플릿 또는 Claude).
 * 문장은 나중에 verify.ts가 이 사실과 다시 대조한다. 사실에 없는 숫자·대상은 문장에 나올 수 없다.
 *
 * 사실마다 공고문 근거(쪽·원문)를 붙인다. 앱과 같은 원칙이다 — 모든 숫자에 출처.
 */
import { housingLabel } from "@housing/engine";
import { regionByCode, type ExtractionOutput, type SupplyUnit } from "@housing/schema";

export interface Source {
  page: number;
  text: string;
}

export interface Fact<T> {
  value: T;
  source?: Source;
}

/** 이 공고가 받는 사람들. 트랙 이름·혼인 규칙에서 읽는다 — "누가 볼 만한지"까지가 게시물의 몫이다 */
export type Target = "청년" | "대학생" | "신혼부부" | "예비신혼부부" | "신생아 가구" | "한부모" | "고령자" | "수급자" | "주거약자" | "장애인" | "국가유공자" | "일반";

export interface SocialFacts {
  id: string;
  provider: string;
  title: string;
  /** "매입임대", "영구임대" … (engine housingLabel) */
  kind: string;
  /** "서울" */
  region: string;
  /** "강서구". 집이 흩어진 공고나 주소가 시도뿐이면 없다 */
  district?: string;
  /** 모집 규모. 집 단위 공고는 호, 단지는 세대 */
  supply?: Fact<{ count: number; unit: "호" | "세대" }>;
  /** 전용면적 범위 (㎡, 반올림) */
  area?: Fact<[number, number]>;
  apply: { start?: string; end?: string };
  winnerAnnounce?: string;
  targets: Fact<Target>[];
  /** 사람마다 통과 여부가 갈리는 기준들 — 게시물에서는 △로 "있음"만 말한다 */
  criteria: { income?: Source; asset?: Source; car?: Source; homeless?: Source; subscription?: Source; residence?: Source };
  /**
   * "여기서 갈린다" 후보. 전부 공고문에 있는 구조적 차이라 낚시가 아니다.
   * 예: 맞벌이는 소득 기준이 다르다, 1~4순위로 나뉜다, 소득 구간마다 임대료가 다르다.
   */
  splits: Fact<string>[];
  /**
   * 임대료 범위 (원). 게시물 앞부분이 "얼마인가"를 숫자로 말해야 광고가 아니라 정보가 된다.
   * 집 단위 공고는 집마다의 **일반 구간**(높은 쪽) 임대료로 잡는다 — 낮은 구간으로 잡으면 대부분에게 싸게 보인다.
   * lowerTier: 수급자·1순위 같은 낮은 구간이 따로 있다는 사실 (그 사람들은 이보다 싸다).
   */
  rent?: Fact<{ deposit: [number, number]; monthly: [number, number]; lowerTier: string | null }>;
  /**
   * 자격 기준 숫자. **공급 유형(트랙)마다 값이 같을 때만** 숫자로 둔다. 다르면 "varies" —
   * 하나를 골라 적으면 다른 유형 대상자에게는 틀린 숫자가 된다.
   */
  limits: {
    /** 1인 가구 월소득 상한 (외벌이) */
    income1?: Limit;
    /** 2인 가구 외벌이·맞벌이 월소득 상한 — "맞벌이는 기준이 달라요"를 숫자로 말할 때 */
    income2single?: Limit;
    income2dual?: Limit;
    asset?: Limit;
    car?: Limit;
    /** 만 나이 [최소, 최대]. for가 있으면 그 계층에만 적용되는 기준 */
    age?: (Fact<[number, number]> & { for?: string }) | "varies";
  };
}

export type Limit = Fact<number> | "varies";

type Row = {
  id: string;
  provider?: string;
  title: string;
  housing_type: string;
  region_code: string;
  address?: string;
  apply_start?: string;
  apply_end?: string;
  units?: SupplyUnit[];
  extraction: ExtractionOutput;
};

const TARGET_RULES: [RegExp, Target][] = [
  [/대학생/, "대학생"],
  [/청년/, "청년"],
  [/신생아/, "신생아 가구"],
  [/예비신혼/, "예비신혼부부"],
  [/신혼/, "신혼부부"],
  [/한부모/, "한부모"],
  [/고령자/, "고령자"],
  [/수급자/, "수급자"],
  // 주거약자는 고령자·장애인·국가유공자를 묶은 말이다. 장애인으로 좁혀 부르지 않는다
  [/주거약자/, "주거약자"],
  [/장애인/, "장애인"],
  [/국가유공자/, "국가유공자"],
];

type Rule = ExtractionOutput["tracks"][number]["rules"][number];

/**
 * 조건에 맞는 "이하" 규칙이 **모든 트랙에** 같은 값으로 있으면 그 값, 아니면 varies, 아무 데도 없으면 undefined.
 * 규칙이 있는 트랙끼리만 비교하면 안 된다 — 강서염창의 "만 18~39세"는 청년 트랙에만 있는데
 * 공고 전체 조건처럼 적힐 뻔했다. 고령자·일반공급 대상자에게는 틀린 숫자다.
 */
function limitOf(x: ExtractionOutput, test: (r: Rule) => boolean): Limit | undefined {
  const hits = x.tracks.flatMap((t) => t.rules).filter((r) => test(r) && r.operator === "lte" && typeof r.value === "number");
  if (hits.length === 0) return undefined;
  const values = new Set(hits.map((r) => r.value as number));
  const everywhere = x.tracks.every((t) => t.rules.some((r) => test(r) && r.operator === "lte"));
  if (values.size > 1 || !everywhere) return "varies";
  const r = hits[0]!;
  return { value: r.value as number, source: { page: r.source.page, text: r.source.text.slice(0, 160) } };
}

/**
 * 나이 [최소, 최대]. 모든 트랙에 같은 값이면 공고 전체 기준, 청년 트랙에만 있으면 "청년 계층" 기준으로 밝힌다(for).
 * 그 밖에 흩어져 있으면 varies — 한 줄로 말할 수 없다.
 */
function ageOf(x: ExtractionOutput): SocialFacts["limits"]["age"] {
  const isAge = (r: Rule) => r.category === "age" && r.operator === "between" && Array.isArray(r.value);
  const hits = x.tracks.flatMap((t) => t.rules).filter(isAge);
  if (hits.length === 0) return undefined;
  const values = new Set(hits.map((r) => JSON.stringify(r.value)));
  if (values.size > 1) return "varies";
  const r = hits[0]!;
  const [a, b] = r.value as [number, number];
  const withAge = x.tracks.filter((t) => t.rules.some(isAge));
  const scope = withAge.length === x.tracks.length ? undefined : withAge.every((t) => /청년/.test(t.name)) ? "청년 계층" : null;
  if (scope === null) return "varies";
  return { value: [a, b], for: scope, source: { page: r.source.page, text: r.source.text.slice(0, 160) } };
}

function rentOf(row: Row): SocialFacts["rent"] {
  // 집 단위: 집마다 기본(전환 전) 조건 중 마지막 구간 = 일반 구간
  if (row.units?.length) {
    const general: { deposit: number; monthly: number }[] = [];
    let lowerTier: string | null = null;
    for (const u of row.units) {
      const bases = (u.rent_options ?? []).filter((o) => !o.max_conversion);
      const g = bases.at(-1);
      if (g) general.push({ deposit: g.deposit, monthly: g.monthly_rent });
      else if (u.deposit !== undefined) general.push({ deposit: u.deposit, monthly: u.monthly_rent ?? 0 });
      if (bases.length > 1 && !lowerTier) lowerTier = bases[0]!.tier;
    }
    if (general.length === 0) return undefined;
    const span = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];
    return {
      value: { deposit: span(general.map((g) => g.deposit)), monthly: span(general.map((g) => g.monthly)), lowerTier },
      source: { page: 0, text: `공급주택목록 첨부 (${general.length}채, 일반 구간)` },
    };
  }
  const rows = row.extraction.tracks.flatMap((t) => t.pricing).filter((p) => p.kind === "rental" && p.deposit !== undefined && p.deposit !== null);
  if (rows.length === 0) return undefined;
  const deps = rows.map((p) => p.deposit as number);
  const mons = rows.map((p) => p.monthly_rent ?? 0);
  return {
    value: { deposit: [Math.min(...deps), Math.max(...deps)], monthly: [Math.min(...mons), Math.max(...mons)], lowerTier: null },
    source: { page: rows[0]!.source.page, text: rows[0]!.source.text.slice(0, 160) },
  };
}

/** 공고문 표기 그대로의 첫 근거 */
const firstSource = (x: ExtractionOutput, test: (r: ExtractionOutput["tracks"][number]["rules"][number]) => boolean): Source | undefined => {
  for (const t of x.tracks) for (const r of t.rules) if (test(r)) return { page: r.source.page, text: r.source.text.slice(0, 160) };
  return undefined;
};

export function buildFacts(row: Row): SocialFacts {
  const x = row.extraction;
  const region = regionByCode(row.region_code)?.label ?? "";
  // "서울특별시 강서구 공항대로…" → "강서구". 집이 흩어졌거나 주소가 시도뿐이면 구를 말하지 않는다
  const scattered = (row.units?.length ?? 0) > 0;
  const district = !scattered ? /\s(\S+(?:구|군|시))(?:\s|$)/.exec(row.address ?? "")?.[1] : undefined;

  // 모집 규모: 집 단위 공고는 집 수, 아니면 트랙 세대 수 합.
  // 세대 수가 **모든** 트랙에 있을 때만 더한다 — 강서염창은 5개 트랙 중 철거민 우선공급에만 4세대가 적혀 있어
  // "모집 4세대"가 될 뻔했다. 모르는 합계는 말하지 않는다.
  const complete = x.tracks.length > 0 && x.tracks.every((t) => typeof t.households === "number" && t.households > 0);
  const households = complete ? x.tracks.reduce((s, t) => s + (t.households ?? 0), 0) : 0;
  const supply: SocialFacts["supply"] = scattered
    ? { value: { count: row.units!.length, unit: "호" }, source: { page: 0, text: "공급주택목록 첨부" } }
    : households > 0
      ? { value: { count: households, unit: "세대" } }
      : undefined;

  const areas = [...x.tracks.flatMap((t) => t.unit_types.map((u) => u.exclusive_area_m2)), ...(row.units ?? []).map((u) => u.exclusive_area_m2)].filter(
    (a): a is number => typeof a === "number" && a > 0,
  );
  const area: SocialFacts["area"] = areas.length ? { value: [Math.round(Math.min(...areas)), Math.round(Math.max(...areas))] } : undefined;

  /*
   * 대상: 공고 제목이 먼저, 트랙 이름이 그다음.
   * 제목이 이 공고가 누구를 위한 것인지 말한다. 청년매입임대의 트랙 "1순위(수급자·한부모 가구)"는 한부모를 위한 공급이
   * 아니라 **그런 가구의 청년**이라는 순위 조건이다 — 트랙 이름만 봤더니 첫 줄이 "서울 한부모 매입임대"가 됐다.
   * 그래서 제목이 청년·대학생 공급이면 트랙의 가구 계층(수급자·한부모·장애인)은 대상으로 세지 않는다.
   * 신혼·신생아 공급의 "1순위(신생아·한부모가족)"는 한부모가족이 따로 받는 자리라 그대로 센다.
   */
  const targets = new Map<Target, Fact<Target>>();
  for (const [re, target] of TARGET_RULES) {
    if (re.test(row.title)) targets.set(target, { value: target, source: { page: 0, text: row.title } });
  }
  const youthProgram = targets.has("청년") || targets.has("대학생");
  const HOUSEHOLD_GROUPS: Target[] = ["수급자", "한부모", "장애인", "국가유공자"];
  for (const t of x.tracks) {
    for (const [re, target] of TARGET_RULES) {
      if (youthProgram && HOUSEHOLD_GROUPS.includes(target)) continue;
      if (re.test(t.name) && !targets.has(target)) targets.set(target, { value: target, source: { page: t.rules[0]?.source.page ?? 0, text: t.name } });
    }
    const pre = t.rules.find((r) => r.category === "marriage" && JSON.stringify(r.value).includes("pre_marriage"));
    if ((pre || /예비신혼/.test(t.name)) && !targets.has("예비신혼부부")) {
      targets.set("예비신혼부부", { value: "예비신혼부부", source: pre ? { page: pre.source.page, text: pre.source.text.slice(0, 160) } : { page: 0, text: t.name } });
    }
  }
  // 이름에 대상이 없는 일반공급만 있으면 "일반"
  if (targets.size === 0 || x.tracks.some((t) => /일반공급\s*[-–]?\s*일반|^일반/.test(t.name))) targets.set("일반", { value: "일반" });

  const criteria: SocialFacts["criteria"] = {
    income: firstSource(x, (r) => r.category === "income"),
    asset: firstSource(x, (r) => r.category === "asset"),
    car: firstSource(x, (r) => r.category === "car_value"),
    homeless: firstSource(x, (r) => r.category === "housing"),
    subscription: firstSource(x, (r) => r.category === "subscription"),
    residence: firstSource(x, (r) => r.category === "residence"),
  };

  const splits: Fact<string>[] = [];
  const dual = firstSource(x, (r) => r.category === "income" && r.applies_to?.income_type === "dual");
  if (dual) splits.push({ value: "맞벌이는 소득 기준이 따로 있어요", source: dual });
  const ranks = x.tracks.filter((t) => /\d순위/.test(t.name));
  if (ranks.length >= 2) splits.push({ value: `${ranks.length}순위로 나눠 뽑아요`, source: { page: ranks[0]!.rules[0]?.source.page ?? 0, text: ranks.map((t) => t.name).join(" / ").slice(0, 160) } });
  const priority = x.tracks.find((t) => /우선공급/.test(t.name));
  if (priority && x.tracks.some((t) => /일반공급/.test(t.name))) splits.push({ value: "우선공급과 일반공급 조건이 달라요", source: { page: priority.rules[0]?.source.page ?? 0, text: priority.name } });
  // 완화 모집은 제목이 그 사실을 말한다 — 이 공고에서 가장 중요한 정보다
  if (/완화/.test(row.title)) splits.unshift({ value: "자격 요건을 완화한 모집이에요", source: { page: 0, text: row.title } });
  const tiered = x.tracks.flatMap((t) => t.pricing).find((p) => p.tier && /구간|수급자|소득/.test(p.tier));
  if (tiered || row.units?.some((u) => (u.rent_options?.length ?? 0) > 1)) {
    splits.push({ value: "소득에 따라 임대료가 달라요", source: tiered ? { page: tiered.source.page, text: `${tiered.unit_type} · ${tiered.tier}` } : { page: 0, text: "공급주택목록 첨부" } });
  }

  return {
    rent: rentOf(row),
    limits: {
      income1: limitOf(x, (r) => r.category === "income" && r.applies_to?.household_size === 1 && r.applies_to?.income_type !== "dual"),
      income2single: limitOf(x, (r) => r.category === "income" && r.applies_to?.household_size === 2 && r.applies_to?.income_type === "single"),
      income2dual: limitOf(x, (r) => r.category === "income" && r.applies_to?.household_size === 2 && r.applies_to?.income_type === "dual"),
      asset: limitOf(x, (r) => r.category === "asset"),
      // 자동차 0원 상한(수급자 트랙 등)은 "차가 없어야 한다"는 뜻이라 금액 기준과 섞지 않는다
      car: limitOf(x, (r) => r.category === "car_value" && Number(r.value) > 0),
      age: ageOf(x),
    },
    id: row.id,
    provider: row.provider ?? "LH",
    title: row.title,
    kind: housingLabel(row),
    region,
    district,
    supply,
    area,
    apply: { start: row.apply_start ?? x.schedule.apply_start, end: row.apply_end ?? x.schedule.apply_end },
    winnerAnnounce: /^\d{4}-\d{2}-\d{2}$/.test(x.schedule.winner_announce ?? "") ? x.schedule.winner_announce : undefined,
    targets: [...targets.values()],
    criteria,
    splits,
  };
}
