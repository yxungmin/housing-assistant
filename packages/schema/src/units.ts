import type { SupplyUnit } from "./rules";

/**
 * 흩어진 집(매입임대·전세임대)의 좌표·역·주변은 **주소마다** 한 벌이다.
 *
 * 한 건물에 여러 세대가 있어 420채가 주소 119곳이었고(014), 집마다 nearby·transit 사본을 들고 있으니
 * 번들 1.2 MB 중 480 KB가 그 사본이었다 (2026-09-24 감사). 저장할 때는 주소 → 장소 표(`unit_places`) 하나로 접고,
 * 앱이 읽을 때 집마다 다시 붙인다 — 화면·lib/units.ts는 예전처럼 `unit.lat`을 본다.
 *
 * Supabase의 `units` jsonb는 펼친 채로 둔다(Edge Function `transit`이 unit.lat을 읽는다). 접는 것은 번들 파일뿐이다.
 */
export interface UnitPlace {
  lat: number;
  lng: number;
  transit?: SupplyUnit["transit"];
  nearby?: SupplyUnit["nearby"];
}

export type UnitPlaces = Record<string, UnitPlace>;

/** 집 목록에서 좌표·역·주변을 떼어 주소별 표로. 좌표가 없는 집은 표에 안 들어간다 */
export function deflateUnits(units: SupplyUnit[]): { units: SupplyUnit[]; unit_places: UnitPlaces } {
  const unit_places: UnitPlaces = {};
  const stripped = units.map((u) => {
    const { lat, lng, transit, nearby, ...rest } = u;
    if (lat !== undefined && lng !== undefined && !unit_places[u.address]) {
      unit_places[u.address] = { lat, lng, ...(transit ? { transit } : {}), ...(nearby ? { nearby } : {}) };
    }
    return rest as SupplyUnit;
  });
  return { units: stripped, unit_places };
}

/** 주소별 표를 집마다 다시 붙인다. 표에 없는 집은 그대로(좌표 없음) */
export function inflateUnits(units: SupplyUnit[], places: UnitPlaces | undefined): SupplyUnit[] {
  if (!places) return units;
  return units.map((u) => {
    if (u.lat !== undefined) return u;
    const p = places[u.address];
    return p ? { ...u, lat: p.lat, lng: p.lng, ...(p.transit ? { transit: p.transit } : {}), ...(p.nearby ? { nearby: p.nearby } : {}) } : u;
  });
}
