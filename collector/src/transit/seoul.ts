/**
 * 서울시 대중교통 환승경로 → "직장까지 다닐 만한가".
 *
 * 지금 앱은 직선거리만 보여 준다("직장 17km"). 사람이 판단에 쓰는 기준은 거리가 아니라 시간이다.
 *
 * 2026-09-21 확인 (공공데이터포털, 무료·자동승인, 개발계정 하루 1,000회):
 *   http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoByBusNSub   버스+지하철 환승
 *   http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoBySubway    지하철만
 *   http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoByBus       버스만
 * 요청: startX, startY, endX, endY (경위도). 응답(XML): distance, time(소요시간), pathList,
 *       routeNm(노선명), fname/tname(탑승·하차지명) 등.
 *
 * 서울시가 제공하는 서비스라 경기 구간은 답이 없을 수 있다. 그때는 호출부가 직선거리로 되돌아간다.
 *
 * 이 API만 호출이 사용자 수에 비례한다(직장 좌표 × 단지). 나머지 셋은 공고 수에만 비례한다.
 * 그래서 결과를 (출발지, 도착지) 반올림 좌표로 캐시한다 — 우리가 쓰는 직장 좌표는
 * 시군구 대표 좌표라 사용자끼리 많이 겹친다. 마포구에서 과천 단지까지는 한 번만 구하면 된다.
 */
const BASE = "http://ws.bus.go.kr/api/rest/pathinfo";

export interface Commute {
  /** 편도 소요 시간 (분) */
  minutes: number;
  /** 환승 횟수. 경로 구간 수 − 1 */
  transfers: number;
  /** 이동 거리 (m). 직선이 아니라 경로 거리 */
  distance_m?: number;
  /** 첫 구간 노선명 (2호선, 7016 …) */
  first_route?: string;
  mode: "bus_subway" | "subway" | "bus";
  source: string;
}

const tag = (xml: string, name: string): string | undefined => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  const v = m?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  return v ? v : undefined;
};

const all = (xml: string, name: string): string[] =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]!.replace(/<!\[CDATA\[|\]\]>/g, "").trim());

/**
 * 응답에서 가장 빠른 경로 하나.
 * 여러 경로가 오면 소요시간이 가장 짧은 것을 고른다 — 사용자가 궁금한 건 "얼마나 걸리나"다.
 */
export function parseCommute(xml: string, mode: Commute["mode"]): Commute | null {
  const paths = [...xml.matchAll(/<itemList>[\s\S]*?<\/itemList>/g)].map((m) => m[0]);
  const blocks = paths.length > 0 ? paths : [xml];
  let best: Commute | null = null;
  for (const block of blocks) {
    const minutes = Number(tag(block, "time") ?? "");
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const routes = all(block, "routeNm");
    const distance = Number(tag(block, "distance") ?? "");
    const commute: Commute = {
      minutes: Math.round(minutes),
      transfers: Math.max(0, routes.length - 1),
      distance_m: Number.isFinite(distance) && distance > 0 ? Math.round(distance) : undefined,
      first_route: routes[0],
      mode,
      source: "서울시 대중교통 환승경로",
    };
    if (!best || commute.minutes < best.minutes) best = commute;
  }
  return best;
}

/** 캐시 키. 좌표를 소수 3자리(약 100m)로 반올림해 사실상 같은 출발·도착을 한 칸에 모은다 */
export const cacheKey = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): string =>
  [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(3)).join(",");

export class TransitClient {
  private readonly cache = new Map<string, Commute | null>();

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async path(op: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<string> {
    const p = new URLSearchParams({
      serviceKey: this.apiKey,
      startX: String(from.lng),
      startY: String(from.lat),
      endX: String(to.lng),
      endY: String(to.lat),
    });
    const res = await this.fetchImpl(`${BASE}/${op}?${p.toString()}`);
    if (!res.ok) throw new Error(`환승경로 ${op} HTTP ${res.status}`);
    return res.text();
  }

  /**
   * 버스+지하철을 먼저 보고, 답이 없으면 지하철만으로 한 번 더 본다.
   * 서울 밖 구간은 둘 다 비는 경우가 있고 그때는 null이다 (화면은 직선거리로 되돌아간다).
   */
  async commute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Commute | null> {
    const key = cacheKey(from, to);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    let result: Commute | null = null;
    for (const [op, mode] of [
      ["getPathInfoByBusNSub", "bus_subway"],
      ["getPathInfoBySubway", "subway"],
    ] as const) {
      try {
        result = parseCommute(await this.path(op, from, to), mode);
      } catch {
        result = null;
      }
      if (result) break;
    }
    this.cache.set(key, result);
    return result;
  }
}

/** 화면 문구. "약 42분 · 환승 1회" */
export function commuteText(c: Commute): string {
  return c.transfers > 0 ? `약 ${c.minutes}분 · 환승 ${c.transfers}회` : `약 ${c.minutes}분 · 환승 없음`;
}
