/**
 * 카카오맵 대중교통 경로 → "직장까지 다닐 만한가".
 *
 * 서울시 API(seoul.ts)를 대신한다. 이유는 하나다 — 서울시 것은 서울 구간만 답한다.
 * 우리 대상의 절반이 경기이고 지방으로 넓힐 계획도 있는데 그때마다 빈칸이 된다.
 * 카카오는 전국을 덮는다 (2026-09-21 확인: 군산 시내 20분도 정상 응답).
 *
 * 2026-09-21 실응답으로 확인:
 *   GET https://dapi.kakao.com/v2/routing/publictraffic
 *   헤더 Authorization: KakaoAK {REST_API_KEY}
 *   쿼리 start_x, start_y, end_x, end_y (WGS84 경위도)
 *   응답 { status, properties: { total, bus, subway, busAndSubway, landingURL }, routes: [{ properties: {
 *          type(BUS|SUBWAY|BUS_AND_SUBWAY), totalDistance(m), totalTime(초), transfers, fare: { value } } }] }
 *   status가 OK가 아니면 routes가 없다 (STARTNODES_NULL·NO_RESULTS 등).
 *   마포구청 → 과천지식정보타운: 15개 경로, 가장 빠른 것이 지하철 56분·환승 1회·1,850원.
 *
 * 무료 쿼터는 하루 1,000건이라 서울시 API와 같다. 그래서 호출 방식도 그대로다 —
 * 사용자마다 부르지 않고 수집할 때 시군구 대표 좌표에서 미리 계산해 표로 저장한다.
 */
export interface KakaoCommute {
  /** 편도 소요 시간 (분) */
  minutes: number;
  transfers: number;
  distance_m?: number;
  /** 대중교통 요금 (원) */
  fare?: number;
  mode: "bus" | "subway" | "bus_subway";
  source: string;
}

const MODE: Record<string, KakaoCommute["mode"]> = { BUS: "bus", SUBWAY: "subway", BUS_AND_SUBWAY: "bus_subway" };

interface RouteProps {
  type?: string;
  totalDistance?: number;
  totalTime?: number;
  transfers?: number;
  fare?: { value?: number };
}

/**
 * 가장 빠른 경로 하나. 사용자가 궁금한 건 "얼마나 걸리나"다.
 * status가 OK가 아니면 null — 없는 값을 지어내지 않는다.
 */
export function parseKakaoCommute(payload: unknown): KakaoCommute | null {
  const j = payload as { status?: string; routes?: { properties?: RouteProps }[] };
  if (j?.status !== "OK" || !Array.isArray(j.routes)) return null;
  let best: KakaoCommute | null = null;
  for (const route of j.routes) {
    const p = route?.properties;
    const seconds = p?.totalTime;
    if (!p || typeof seconds !== "number" || seconds <= 0) continue;
    const commute: KakaoCommute = {
      minutes: Math.round(seconds / 60),
      transfers: typeof p.transfers === "number" ? p.transfers : 0,
      distance_m: typeof p.totalDistance === "number" ? p.totalDistance : undefined,
      fare: typeof p.fare?.value === "number" ? p.fare.value : undefined,
      mode: MODE[p.type ?? ""] ?? "bus_subway",
      source: "카카오맵 대중교통 경로",
    };
    if (!best || commute.minutes < best.minutes) best = commute;
  }
  return best;
}

/** 캐시 키. 좌표를 소수 3자리(약 100m)로 묶어 사실상 같은 구간을 한 칸에 모은다 */
export const cacheKey = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): string =>
  [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(3)).join(",");

export class KakaoTransitClient {
  private readonly cache = new Map<string, KakaoCommute | null>();

  constructor(
    private readonly restKey: string,
    private readonly fetchImpl: typeof fetch = resilientFetch(),
  ) {}

  async commute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<KakaoCommute | null> {
    const key = cacheKey(from, to);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    let result: KakaoCommute | null = null;
    try {
      const q = new URLSearchParams({
        start_x: String(from.lng),
        start_y: String(from.lat),
        end_x: String(to.lng),
        end_y: String(to.lat),
      });
      const res = await this.fetchImpl(`https://dapi.kakao.com/v2/routing/publictraffic?${q.toString()}`, {
        headers: { Authorization: `KakaoAK ${this.restKey}` },
      });
      if (res.ok) result = parseKakaoCommute(await res.json());
    } catch {
      result = null;
    }
    // 실패도 캐시한다. 같은 구간을 매번 다시 물으면 하루 한도만 쓴다.
    this.cache.set(key, result);
    return result;
  }
}
import { resilientFetch } from "../http";
