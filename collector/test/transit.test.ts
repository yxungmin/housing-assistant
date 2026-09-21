import { describe, expect, it } from "vitest";
import { cacheKey, commuteText, parseCommute, TransitClient } from "../src/transit/seoul";

/** 명세(요청변수·출력결과)에 적힌 필드로 만든 응답 모양 */
const TWO_PATHS = `<ServiceResult><msgBody>
<itemList><distance>12400</distance><time>42</time><routeNm>2호선</routeNm><routeNm>7016</routeNm>
<fname>홍대입구역</fname><tname>과천청사역</tname></itemList>
<itemList><distance>15800</distance><time>58</time><routeNm>6호선</routeNm></itemList>
</msgBody></ServiceResult>`;

const NO_ROUTE = `<ServiceResult><msgBody></msgBody></ServiceResult>`;

describe("parseCommute", () => {
  it("소요시간과 환승 횟수를 읽는다", () => {
    const c = parseCommute(TWO_PATHS, "bus_subway")!;
    expect(c.minutes).toBe(42);
    expect(c.transfers).toBe(1); // 노선 2개 = 환승 1회
    expect(c.distance_m).toBe(12_400);
    expect(c.first_route).toBe("2호선");
    expect(c.mode).toBe("bus_subway");
  });

  it("여러 경로가 오면 가장 빠른 것을 고른다", () => {
    expect(parseCommute(TWO_PATHS, "bus_subway")!.minutes).toBe(42);
  });

  it("노선이 하나면 환승 0회", () => {
    const c = parseCommute(`<itemList><time>21</time><routeNm>4호선</routeNm></itemList>`, "subway")!;
    expect(c.transfers).toBe(0);
  });

  it("경로가 없으면 null — 서울 밖 구간은 답이 안 온다", () => {
    expect(parseCommute(NO_ROUTE, "bus_subway")).toBeNull();
    expect(parseCommute("", "bus_subway")).toBeNull();
  });

  it("소요시간이 0이거나 숫자가 아니면 버린다", () => {
    expect(parseCommute(`<itemList><time>0</time></itemList>`, "bus_subway")).toBeNull();
    expect(parseCommute(`<itemList><time>알 수 없음</time></itemList>`, "bus_subway")).toBeNull();
  });
});

describe("cacheKey", () => {
  it("100m 안쪽이면 같은 칸으로 모은다 — 시군구 대표 좌표는 사용자끼리 겹친다", () => {
    const a = cacheKey({ lat: 37.5663, lng: 126.9019 }, { lat: 37.4316, lng: 126.9982 });
    const b = cacheKey({ lat: 37.56634, lng: 126.90191 }, { lat: 37.43158, lng: 126.99822 });
    expect(a).toBe(b);
  });

  it("멀어지면 다른 칸", () => {
    const a = cacheKey({ lat: 37.566, lng: 126.901 }, { lat: 37.431, lng: 126.998 });
    const b = cacheKey({ lat: 37.480, lng: 127.050 }, { lat: 37.431, lng: 126.998 });
    expect(a).not.toBe(b);
  });
});

describe("TransitClient", () => {
  const seoul = { lat: 37.5663, lng: 126.9019 };
  const gwacheon = { lat: 37.4316, lng: 126.9982 };

  it("좌표를 경위도 순서에 맞게 넣는다", async () => {
    let url = "";
    const fake: typeof fetch = async (u) => {
      url = String(u);
      return new Response(TWO_PATHS, { status: 200 });
    };
    await new TransitClient("KEY", fake).commute(seoul, gwacheon);
    expect(url).toContain("getPathInfoByBusNSub");
    expect(url).toContain(`startX=${seoul.lng}`);
    expect(url).toContain(`startY=${seoul.lat}`);
    expect(url).toContain(`endX=${gwacheon.lng}`);
  });

  it("버스+지하철이 비면 지하철만으로 한 번 더 본다", async () => {
    const ops: string[] = [];
    const fake: typeof fetch = async (u) => {
      const s = String(u);
      ops.push(s.includes("BusNSub") ? "busnsub" : "subway");
      return new Response(s.includes("BusNSub") ? NO_ROUTE : `<itemList><time>35</time><routeNm>4호선</routeNm></itemList>`, { status: 200 });
    };
    const c = await new TransitClient("KEY", fake).commute(seoul, gwacheon);
    expect(ops).toEqual(["busnsub", "subway"]);
    expect(c?.minutes).toBe(35);
    expect(c?.mode).toBe("subway");
  });

  it("둘 다 비면 null이고 화면은 직선거리로 되돌아간다", async () => {
    const fake: typeof fetch = async () => new Response(NO_ROUTE, { status: 200 });
    expect(await new TransitClient("KEY", fake).commute(seoul, gwacheon)).toBeNull();
  });

  it("같은 구간을 다시 물으면 호출하지 않는다", async () => {
    let calls = 0;
    const fake: typeof fetch = async () => {
      calls++;
      return new Response(TWO_PATHS, { status: 200 });
    };
    const client = new TransitClient("KEY", fake);
    await client.commute(seoul, gwacheon);
    await client.commute(seoul, gwacheon);
    expect(calls).toBe(1);
  });

  it("실패한 결과도 캐시한다 — 같은 구간을 매번 다시 물으면 한도만 쓴다", async () => {
    let calls = 0;
    const fake: typeof fetch = async () => {
      calls++;
      return new Response(NO_ROUTE, { status: 200 });
    };
    const client = new TransitClient("KEY", fake);
    await client.commute(seoul, gwacheon);
    await client.commute(seoul, gwacheon);
    expect(calls).toBe(2); // 첫 호출에서 두 오퍼레이션을 다 썼고, 두 번째는 캐시
  });
});

describe("commuteText", () => {
  it("환승이 있으면 횟수를 적는다", () => {
    expect(commuteText({ minutes: 42, transfers: 1, mode: "bus_subway", source: "x" })).toBe("약 42분 · 환승 1회");
  });
  it("없으면 없다고 적는다", () => {
    expect(commuteText({ minutes: 21, transfers: 0, mode: "subway", source: "x" })).toBe("약 21분 · 환승 없음");
  });
});
