/**
 * Kakao Local API — 주소 → 좌표, 주변 지하철역·버스정류장·생활 인프라. 공고당 1회, 수집 때만 호출.
 * 실패하면 좌표 없이 저장하고 앱은 지도·통근 조건을 숨긴다.
 *
 * 여기서 나오는 건 전부 "가장 가까운 한 곳까지의 직선거리"다. 경로도 환승도 소요 시간도 아니다.
 * 통근 시간을 말하려면 교통 API(ODsay·카카오모빌리티 등)를 따로 붙여야 하고, 그 전까지 앱은
 * 있는 것만 말한다 (apps/mobile/src/lib/commute.ts).
 */
import type { NearbyKind } from "@housing/schema";

export interface GeoResult {
  lat: number;
  lng: number;
  transit: {
    nearest_station?: string;
    station_walk_min?: number;
    station_distance_m?: number;
    nearest_bus_stop?: string;
    bus_walk_min?: number;
    bus_distance_m?: number;
  };
  nearby: { kind: NearbyKind; name: string; distance_m: number }[];
}

const WALK_M_PER_MIN = 67; // 약 4km/h

/** 앱이 보여 주는 종류 ↔ Kakao 카테고리 코드. 반경은 "걸어갈 만한가"로 갈라 정한다. */
const NEARBY_CATEGORIES: { kind: NearbyKind; code: string; radius: number }[] = [
  { kind: "daycare", code: "PS3", radius: 1000 }, // 어린이집·유치원
  { kind: "school", code: "SC4", radius: 1500 }, // 학교
  { kind: "mart", code: "MT1", radius: 1500 }, // 대형마트
  { kind: "convenience", code: "CS2", radius: 700 }, // 편의점
  { kind: "hospital", code: "HP8", radius: 2000 }, // 병원
  { kind: "park", code: "AT4", radius: 1500 }, // 관광명소 — 공원이 이 코드로 들어온다
];

export async function geocodeAddress(address: string, restKey: string, fetchImpl: typeof fetch = fetch): Promise<GeoResult | null> {
  const headers = { Authorization: `KakaoAK ${restKey}` };
  const addr = await fetchImpl(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, { headers });
  if (!addr.ok) return null;
  const addrJson = (await addr.json()) as { documents: { x: string; y: string }[] };
  const doc = addrJson.documents[0];
  if (!doc) return null;
  const lng = Number(doc.x);
  const lat = Number(doc.y);

  /** 카테고리에서 가장 가까운 한 곳. 목록이 아니라 감을 주려는 것이라 한 곳만 받는다. */
  const nearest = async (code: string, radius: number): Promise<{ name: string; distance_m: number } | null> => {
    const res = await fetchImpl(
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=1`,
      { headers },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { documents: { place_name: string; distance: string }[] };
    const d = json.documents[0];
    return d ? { name: d.place_name, distance_m: Number(d.distance) } : null;
  };
  const walkMin = (m: number) => Math.round(m / WALK_M_PER_MIN);

  const transit: GeoResult["transit"] = {};
  const station = await nearest("SW8", 1500);
  if (station) {
    transit.nearest_station = station.name;
    transit.station_distance_m = station.distance_m;
    transit.station_walk_min = walkMin(station.distance_m);
  }
  const bus = await nearest("BS8", 1500);
  if (bus) {
    transit.nearest_bus_stop = bus.name;
    transit.bus_distance_m = bus.distance_m;
    transit.bus_walk_min = walkMin(bus.distance_m);
  }

  const nearby: GeoResult["nearby"] = [];
  for (const c of NEARBY_CATEGORIES) {
    const found = await nearest(c.code, c.radius);
    if (found) nearby.push({ kind: c.kind, name: found.name, distance_m: found.distance_m });
  }

  return { lat, lng, transit, nearby };
}
