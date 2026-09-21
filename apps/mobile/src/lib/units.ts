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
