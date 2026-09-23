import { haversineKm } from "@housing/engine";
import type { SupplyUnit, UserProfile } from "@housing/schema";

/**
 * 흩어져 있는 집 다루기 (매입임대·전세임대).
 *
 * 이 유형은 단지가 아니라 개별 주택 수십~수백 채를 한 공고로 모집한다. 공고문 본문에는
 * "총 81호"만 있고 집마다의 소재지는 별도 엑셀에 있다 (수집기 `units/list.ts`).
 *
 * 그래서 화면이 달라야 한다. 단지형은 "이 집이 나에게 맞나"를 묻지만, 이쪽은 먼저
 * "어느 집을 고를 수 있나"를 묻는다. 공고 하나의 좌표로 통근 시간을 계산해 보여 주면
 * 그건 시청 좌표에서 잰 값이고, 실제로 신청할 집과는 아무 상관이 없다.
 */

export interface UnitWithDistance {
  unit: SupplyUnit;
  /** 직장까지 직선거리 (km). 직장이나 좌표가 없으면 null */
  km: number | null;
}

/**
 * 흩어진 공고인가.
 *
 * 목록을 읽은 공고는 확실하다. 목록이 없어도 주소가 시도까지만 있으면("서울특별시")
 * 그건 한 채의 주소가 아니라 관할 구역이다 — 그 좌표로 통근을 계산하면 시청에서 잰 값이 된다.
 */
export function isScattered(a: { units?: SupplyUnit[]; address?: string; housing_type?: string }): boolean {
  if (a.units?.length) return true;
  const address = a.address?.trim();
  if (!address) return false;
  // "서울특별시 강서구 …"처럼 시군구가 있으면 한 곳을 가리킨다. 시도뿐이면 구역이다.
  return !/(시|군|구)\s/.test(`${address} `) || address.split(/\s+/).length <= 1;
}

type Point = { lat: number; lng: number };

/**
 * 직장·배우자 직장·사는 곳에서 공고까지의 직선거리 (km).
 *
 * 흩어진 공고의 좌표는 한 집이 아니라 관할 구역의 대표점(대개 시청)이다. 그걸로 재면
 * 서울 전역 모집 공고가 을지로 직장인에게 "직장까지 0.3km"가 된다 — 실제로 홈 목록에 그렇게 떴다(2026-09-23).
 * 공고 상세는 이미 이 유형에서 위치 섹션을 끄는데, 목록과 "출퇴근 가까운 곳" 필터는 그 좌표를 그대로 쓰고 있었다.
 *
 * 그래서 흩어진 공고는 **집마다** 재서 가장 가까운 집을 쓴다. 부부는 두 사람 중 먼 쪽이 가장 짧은 집 하나를 골라
 * 그 집 기준으로 두 거리를 같이 적는다 — 사람마다 다른 집을 고르면 둘 다 가까운 집이 있는 것처럼 보인다.
 * 집 좌표가 하나도 없으면 거리를 말하지 않는다. 없는 값을 대표점으로 채우지 않는다.
 */
export function distancesTo(
  a: { units?: SupplyUnit[]; address?: string; lat?: number; lng?: number },
  work: Point | undefined | null,
  partner: Point | undefined | null,
  home: Point | undefined | null,
): { work: number | null; partner: number | null; home: number | null; nearestHouse: boolean } {
  const scattered = isScattered(a);
  const points: Point[] = scattered
    ? (a.units ?? []).flatMap((u) => (u.lat !== undefined && u.lng !== undefined ? [{ lat: u.lat, lng: u.lng }] : []))
    : a.lat !== undefined && a.lng !== undefined
      ? [{ lat: a.lat, lng: a.lng }]
      : [];
  if (points.length === 0) return { work: null, partner: null, home: null, nearestHouse: scattered };

  const d = (from: Point | undefined | null, to: Point) => (from ? haversineKm(from, to) : null);
  const minTo = (from: Point | undefined | null) => (from ? Math.min(...points.map((p) => haversineKm(from, p))) : null);

  // 부부 기준으로 한 집을 고른다. 한 사람만 있으면 그 사람에게 가장 가까운 집
  let pick: Point | undefined;
  if (work || partner) {
    let best = Infinity;
    for (const p of points) {
      const cost = Math.max(d(work, p) ?? 0, d(partner, p) ?? 0);
      if (cost < best) {
        best = cost;
        pick = p;
      }
    }
  }
  return {
    work: pick ? d(work, pick) : null,
    partner: pick ? d(partner, pick) : null,
    home: minTo(home),
    nearestHouse: scattered,
  };
}

/** 직장에서 가까운 순. 직장이 없으면 보증금이 싼 순 — 고를 기준이 없으면 돈이 기준이다. */
export function unitsWithDistance(units: SupplyUnit[], profile: UserProfile | null | undefined): UnitWithDistance[] {
  const work = profile?.workplace;
  const rows = units.map((unit) => ({
    unit,
    km: work && unit.lat !== undefined && unit.lng !== undefined ? haversineKm(work, { lat: unit.lat, lng: unit.lng }) : null,
  }));
  rows.sort((a, b) => {
    if (a.km !== null && b.km !== null) return a.km - b.km;
    if (a.km !== null) return -1;
    if (b.km !== null) return 1;
    return (a.unit.deposit ?? Infinity) - (b.unit.deposit ?? Infinity);
  });
  return rows;
}

/**
 * 목록 한 줄에 쓰는 이름. 전체 주소는 길어서 한 줄에 안 들어간다.
 * "서울특별시 강동구 구천면로 317(암사동,광채빌라) 광채빌라" → "강동구 구천면로 317"
 */
export function unitLabel(unit: SupplyUnit): string {
  const withoutSido = unit.address.replace(/^[가-힣]+(특별시|광역시|특별자치시|도|특별자치도)\s*/, "");
  const withoutParen = withoutSido.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // 괄호 뒤에 건물 이름이 한 번 더 붙는 경우가 있다. 앞의 세 어절이면 길을 특정한다.
  return withoutParen.split(/\s+/).slice(0, 3).join(" ");
}

/** "3층 · 방 2개 · 전용 47.8㎡" — 집을 고를 때 실제로 보는 것들 */
export function unitSpec(unit: SupplyUnit): string {
  const parts: string[] = [];
  if (unit.floor !== undefined) parts.push(unit.floor < 0 ? `지하 ${Math.abs(unit.floor)}층` : `${unit.floor}층`);
  if (unit.rooms !== undefined) parts.push(`방 ${unit.rooms}개`);
  if (unit.exclusive_area_m2 !== undefined) parts.push(`전용 ${unit.exclusive_area_m2.toFixed(1)}㎡`);
  if (unit.elevator) parts.push("승강기");
  return parts.join(" · ");
}

/**
 * 집을 세우는 기준.
 *
 * 기본은 가까운 순이다 — 흩어진 집에서 고를 때 제일 먼저 걸러지는 것이 거리다.
 * 넓은 순과 보증금 낮은 순은 그다음에 오는 질문이고, 사람마다 순서가 다르다.
 *
 * "저렴한 순"이라 쓰지 않고 "보증금 낮은 순"이라 쓴다. 싸다는 말에는 월세도 들어가는데
 * 보증금과 월세는 서로 바꿀 수 있어서(전환) 한 숫자로 줄이면 우리가 기준을 지어내는 셈이 된다.
 * 목록에 보이는 숫자로 세워야 사람이 결과를 검산할 수 있다.
 */
export type UnitSort = "near" | "large" | "cheap";

export const UNIT_SORT_LABEL: Record<UnitSort, string> = {
  near: "가까운 순",
  large: "넓은 순",
  cheap: "보증금 낮은 순",
};

/** 값이 없는 집은 그 기준에서 맨 뒤로. 없는 값을 0으로 두면 맨 앞에 서 버린다. */
const last = (v: number | undefined | null): number => (v === undefined || v === null ? Number.MAX_SAFE_INTEGER : v);

export function compareUnits(by: UnitSort, a: { unit: SupplyUnit; km: number | null }, b: { unit: SupplyUnit; km: number | null }): number {
  if (by === "large") return last(b.unit.exclusive_area_m2) === last(a.unit.exclusive_area_m2)
    ? last(a.km) - last(b.km)
    : (b.unit.exclusive_area_m2 ?? -1) - (a.unit.exclusive_area_m2 ?? -1);
  if (by === "cheap") {
    const d = last(a.unit.deposit) - last(b.unit.deposit);
    return d !== 0 ? d : last(a.unit.monthly_rent) - last(b.unit.monthly_rent);
  }
  return last(a.km) - last(b.km);
}

/**
 * 이 사람에게 적용되는 임대조건.
 *
 * 매입임대는 같은 집이라도 소득에 따라 월세가 다르다. 수급자·지원대상 한부모가족·차상위계층은
 * 시세 30%, 그 외(소득 70% 이하)는 40%다. 실제로 같은 집에서 476,370원과 651,800원으로 갈렸다 —
 * 첫 줄만 쓰면 대부분의 사람에게 37% 싼 금액을 보여 주게 된다.
 *
 * 어느 구간인지는 프로필의 계층 자격으로 정한다. 모르면 높은 쪽(그 외)을 쓴다 —
 * 주거비를 낮게 보여 주는 실수가 높게 보여 주는 실수보다 나쁘다.
 */
const LOW_TIER_STATUSES = ["basic_livelihood", "welfare_recipient", "single_parent_support"] as const;

export const isLowTier = (profile: UserProfile | null | undefined): boolean =>
  (profile?.statuses ?? []).some((s) => (LOW_TIER_STATUSES as readonly string[]).includes(s));

export interface UnitRent {
  deposit: number;
  monthly_rent: number;
  /** 공고문이 쓴 구간 이름. 화면에 그대로 적어 어느 기준인지 알린다 */
  tier: string;
  /** 보증금을 올려 월세를 낮춘 같은 구간의 조건. 없을 수도 있다 */
  maxConversion?: { deposit: number; monthly_rent: number };
}

export function unitRent(unit: SupplyUnit, profile: UserProfile | null | undefined): UnitRent | null {
  const options = unit.rent_options ?? [];
  if (options.length === 0) {
    return unit.deposit === undefined ? null : { deposit: unit.deposit, monthly_rent: unit.monthly_rent ?? 0, tier: "" };
  }
  const low = isLowTier(profile);
  const bases = options.filter((o) => !o.max_conversion);
  // 구간 순서는 공고문이 낮은 소득부터 적는다. 해당 없으면 마지막(가장 높은 요율)을 쓴다.
  const base = (low ? bases[0] : bases[bases.length - 1]) ?? bases[0];
  if (!base) return null;
  const conversion = options.find((o) => o.max_conversion && o.tier === base.tier);
  return {
    deposit: base.deposit,
    monthly_rent: base.monthly_rent,
    tier: base.tier,
    maxConversion: conversion ? { deposit: conversion.deposit, monthly_rent: conversion.monthly_rent } : undefined,
  };
}

/**
 * 집 단위 공급의 보증금·월세 **범위**.
 *
 * 매입임대는 집이 420채씩 오고 값이 제각각이다. 그런데 화면은 가까운 세 곳만 보여 줘서
 * "이 공고는 대충 얼마인가"에 답하지 못했다 — 그걸 알려면 비용 화면(유료)까지 가야 했다.
 * 범위는 공고문에 적힌 사실이라 가리지 않는다.
 *
 * 같은 값만 있으면 범위가 아니라 한 값으로 돌려준다 — "100만~100만"은 읽는 사람을 속인다.
 */
export interface PriceRange {
  deposit: [number, number] | null;
  monthly_rent: [number, number] | null;
  /** 값이 있는 집의 수 */
  count: number;
}

export function priceRange(units: SupplyUnit[] | undefined, profile: UserProfile | null | undefined): PriceRange | null {
  const rents = (units ?? []).map((u) => unitRent(u, profile)).filter((r): r is UnitRent => r !== null);
  if (rents.length === 0) return null;
  const span = (xs: number[]): [number, number] | null => (xs.length === 0 ? null : [Math.min(...xs), Math.max(...xs)]);
  return {
    deposit: span(rents.map((r) => r.deposit)),
    // 월세가 0인 집(전세형)도 값이다. 빼면 "월세 20만~80만"이 되어 0원인 집을 숨긴다.
    monthly_rent: span(rents.map((r) => r.monthly_rent)),
    count: rents.length,
  };
}

/** "100만 원 ~ 1,000만 원" / 하나뿐이면 "100만 원". 값이 없으면 null */
export function rangeText(r: [number, number] | null, fmt: (n: number) => string): string | null {
  if (!r) return null;
  return r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])} ~ ${fmt(r[1])}`;
}

/**
 * 목록 카드에 적는 크기. "H1 17A · H1 17C · H2 17A …" 같은 주택형 코드는 공고문 안에서만 뜻이 있다 —
 * 사람이 카드에서 알고 싶은 건 "얼마나 넓은가"다. 전용면적이 있으면 범위로, 없으면 예전처럼 코드로 적는다.
 * 흩어진 집은 주택형이 없고 집마다 면적이 있어서 그 범위를 쓴다.
 */
export function sizeText(a: {
  units?: SupplyUnit[];
  extraction: { tracks: { unit_types: { name: string; exclusive_area_m2?: number }[] }[] };
}): string {
  const types = a.extraction.tracks.flatMap((t) => t.unit_types);
  const areas = [
    ...types.map((u) => u.exclusive_area_m2),
    ...(a.units ?? []).map((u) => u.exclusive_area_m2),
  ].filter((x): x is number => typeof x === "number" && x > 0);
  if (areas.length) {
    const lo = Math.round(Math.min(...areas));
    const hi = Math.round(Math.max(...areas));
    return lo === hi ? `전용 ${lo}㎡` : `전용 ${lo}~${hi}㎡`;
  }
  const names = [...new Set(types.map((u) => u.name))];
  return names.length ? names.slice(0, 3).join(" · ") + (names.length > 3 ? ` 외 ${names.length - 3}` : "") : "";
}
