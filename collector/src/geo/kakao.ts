/**
 * Kakao Local API — 주소 → 좌표, 주변 지하철역·버스정류장. 공고당 1회, 빌드 타임에만 호출.
 * 실패하면 좌표 없이 저장하고 앱은 지도·통근 조건을 숨긴다.
 */
export interface GeoResult {
  lat: number;
  lng: number;
  transit: {
    nearest_station?: string;
    station_walk_min?: number;
    nearest_bus_stop?: string;
    bus_walk_min?: number;
  };
}

const WALK_M_PER_MIN = 67; // 약 4km/h

export async function geocodeAddress(address: string, restKey: string, fetchImpl: typeof fetch = fetch): Promise<GeoResult | null> {
  const headers = { Authorization: `KakaoAK ${restKey}` };
  const addr = await fetchImpl(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`, { headers });
  if (!addr.ok) return null;
  const addrJson = (await addr.json()) as { documents: { x: string; y: string }[] };
  const doc = addrJson.documents[0];
  if (!doc) return null;
  const lng = Number(doc.x);
  const lat = Number(doc.y);

  const transit: GeoResult["transit"] = {};
  const nearest = async (categoryCode: "SW8" | "BS8"): Promise<{ name: string; walk_min: number } | null> => {
    const res = await fetchImpl(
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${categoryCode}&x=${lng}&y=${lat}&radius=1500&sort=distance&size=1`,
      { headers },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { documents: { place_name: string; distance: string }[] };
    const d = json.documents[0];
    return d ? { name: d.place_name, walk_min: Math.round(Number(d.distance) / WALK_M_PER_MIN) } : null;
  };
  const station = await nearest("SW8");
  if (station) {
    transit.nearest_station = station.name;
    transit.station_walk_min = station.walk_min;
  }
  const bus = await nearest("BS8");
  if (bus) {
    transit.nearest_bus_stop = bus.name;
    transit.bus_walk_min = bus.walk_min;
  }
  return { lat, lng, transit };
}
