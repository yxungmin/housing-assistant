import { describe, expect, it } from "vitest";
import { cacheKey, KakaoTransitClient, parseKakaoCommute } from "../src/transit/kakao";

/** 2026-09-21 실응답 모양 (마포구청 → 과천지식정보타운, 15개 경로) */
const OK = {
  status: "OK",
  properties: { total: 15, bus: 4, subway: 3, busAndSubway: 8, landingURL: "https://map.kakao.com/..." },
  routes: [
    { properties: { type: "SUBWAY", totalDistance: 22569, totalTime: 3360, transfers: 1, fare: { value: 1850 } } },
    { properties: { type: "BUS_AND_SUBWAY", totalDistance: 21000, totalTime: 3900, transfers: 2, fare: { value: 1750 } } },
    { properties: { type: "BUS", totalDistance: 25000, totalTime: 5400, transfers: 0, fare: { value: 1500 } } },
  ],
};

describe("parseKakaoCommute", () => {
  it("가장 빠른 경로를 고르고 초를 분으로 바꾼다", () => {
    const c = parseKakaoCommute(OK)!;
    expect(c.minutes).toBe(56); // 3360초
    expect(c.transfers).toBe(1);
    expect(c.distance_m).toBe(22569);
    expect(c.fare).toBe(1850);
    expect(c.mode).toBe("subway");
  });

  it("경로 타입을 우리 값으로 옮긴다", () => {
    expect(parseKakaoCommute({ status: "OK", routes: [{ properties: { type: "BUS", totalTime: 600 } }] })!.mode).toBe("bus");
    expect(parseKakaoCommute({ status: "OK", routes: [{ properties: { type: "BUS_AND_SUBWAY", totalTime: 600 } }] })!.mode).toBe("bus_subway");
  });

  it("status가 OK가 아니면 null — 없는 값을 지어내지 않는다", () => {
    for (const status of ["STARTNODES_NULL", "ENDNODES_NULL", "NO_RESULTS", "INVALID_REQUEST", "EQUAL_POINTS"]) {
      expect(parseKakaoCommute({ status })).toBeNull();
    }
  });

  it("빈 응답·깨진 응답에도 터지지 않는다", () => {
    expect(parseKakaoCommute(null)).toBeNull();
    expect(parseKakaoCommute({})).toBeNull();
    expect(parseKakaoCommute({ status: "OK" })).toBeNull();
    expect(parseKakaoCommute({ status: "OK", routes: [{ properties: { totalTime: 0 } }] })).toBeNull();
  });

  it("환승 정보가 없으면 0으로 둔다", () => {
    expect(parseKakaoCommute({ status: "OK", routes: [{ properties: { totalTime: 1200 } }] })!.transfers).toBe(0);
  });
});

describe("KakaoTransitClient", () => {
  const from = { lat: 37.5663, lng: 126.9019 };
  const to = { lat: 37.4316, lng: 126.9982 };

  it("REST 키를 헤더로, 좌표를 경위도 순서로 보낸다", async () => {
    let url = "";
    let auth = "";
    const fake: typeof fetch = async (u, init) => {
      url = String(u);
      auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      return new Response(JSON.stringify(OK), { status: 200 });
    };
    await new KakaoTransitClient("KEY", fake).commute(from, to);
    expect(url).toContain("/v2/routing/publictraffic");
    expect(url).toContain(`start_x=${from.lng}`);
    expect(url).toContain(`start_y=${from.lat}`);
    expect(auth).toBe("KakaoAK KEY");
  });

  it("같은 구간을 다시 물으면 호출하지 않는다", async () => {
    let calls = 0;
    const fake: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify(OK), { status: 200 });
    };
    const c = new KakaoTransitClient("KEY", fake);
    await c.commute(from, to);
    await c.commute(from, to);
    expect(calls).toBe(1);
  });

  it("실패도 캐시한다 — 같은 구간을 매번 다시 물으면 한도만 쓴다", async () => {
    let calls = 0;
    const fake: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ status: "NO_RESULTS" }), { status: 200 });
    };
    const c = new KakaoTransitClient("KEY", fake);
    expect(await c.commute(from, to)).toBeNull();
    await c.commute(from, to);
    expect(calls).toBe(1);
  });

  it("HTTP 오류에도 터지지 않고 null", async () => {
    const fake: typeof fetch = async () => new Response("quota exceeded", { status: 429 });
    expect(await new KakaoTransitClient("KEY", fake).commute(from, to)).toBeNull();
  });

  it("100m 안쪽은 같은 캐시 칸", () => {
    expect(cacheKey(from, to)).toBe(cacheKey({ lat: 37.56634, lng: 126.90191 }, { lat: 37.43158, lng: 126.99822 }));
  });
});
