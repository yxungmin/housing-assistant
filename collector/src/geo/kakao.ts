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
  /** 법정동 코드 10자리. 실거래가 조회에는 앞 5자리를 쓴다 */
  b_code?: string;
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

/**
 * 공고문 주소는 그대로 검색되지 않는 경우가 많다.
 * "경기도 과천시 갈현동 일원(과천지식정보타운 공공주택지구 내 S-11BL)" 같은 꼴이라
 * 괄호와 "일원" 같은 말을 떼고, 그래도 안 되면 시도·시군구·읍면동까지만 남겨 다시 찾는다.
 * 뒤로 갈수록 정확도가 떨어지므로 순서대로 시도하고 첫 성공을 쓴다.
 */
export function addressCandidates(address: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.replace(/\s+/g, " ").trim();
    if (t.length >= 4 && !out.includes(t)) out.push(t);
  };
  push(address);
  const noParen = address.replace(/[(（][^)）]*[)）]/g, " ");
  push(noParen);
  const noFiller = noParen.replace(/\b(일원|일대|내|부지|블록|블럭|지구)\b/g, " ").replace(/[A-Za-z]-?\d+BL?/gi, " ");
  push(noFiller);
  // 시도 시군구 읍면동까지만
  const m = noFiller.match(/^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))\s+(\S+[시군구])\s*(\S+[동읍면리])?/);
  if (m) push([m[1], m[2], m[3]].filter(Boolean).join(" "));
  return out;
}

export async function geocodeAddress(address: string, restKey: string, fetchImpl: typeof fetch = fetch): Promise<GeoResult | null> {
  const headers = { Authorization: `KakaoAK ${restKey}` };
  let doc: { x: string; y: string; address?: { b_code?: string } } | undefined;
  for (const query of addressCandidates(address)) {
    const addr = await fetchImpl(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`, { headers });
    if (!addr.ok) continue;
    const addrJson = (await addr.json()) as { documents: { x: string; y: string; address?: { b_code?: string } }[] };
    if (addrJson.documents?.[0]) {
      doc = addrJson.documents[0];
      break;
    }
  }
  // 주소로 못 찾으면 장소 이름으로 한 번 더 (단지명이 주소 자리에 오는 공고가 있다)
  if (!doc) {
    const kw = await fetchImpl(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address.replace(/[(（][^)）]*[)）]/g, " ").trim())}&size=1`, { headers });
    if (kw.ok) {
      const j = (await kw.json()) as { documents: { x: string; y: string; address_name?: string }[] };
      const d = j.documents?.[0];
      if (d) doc = { x: d.x, y: d.y };
    }
  }
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

  return { b_code: doc.address?.b_code, lat, lng, transit, nearby };
}
