import { describe, expect, it } from "vitest";
import type { UserProfile } from "@housing/schema";
import { commuteLines, commuteShort, mapUrl, meters, splitStation, transitLines } from "../src/lib/commute";

const profile = (over: Partial<UserProfile> = {}): UserProfile =>
  ({
    workplace: { label: "서울 강남구", lat: 37.517, lng: 127.047 },
    ...over,
  }) as UserProfile;

describe("splitStation", () => {
  it('Kakao의 "망원역 6호선"을 역과 호선으로 나눈다', () => {
    expect(splitStation("망원역 6호선")).toEqual({ station: "망원역", line: "6호선" });
  });

  it("호선이 안 붙어 오면 역 이름만 남긴다 — 없는 호선을 지어내지 않는다", () => {
    expect(splitStation("봉천역")).toEqual({ station: "봉천역" });
  });

  it("역 이름에 공백이 있어도 마지막 '역'까지를 이름으로 본다", () => {
    expect(splitStation("동대문역사문화공원역 2호선")).toEqual({ station: "동대문역사문화공원역", line: "2호선" });
  });
});

describe("transitLines", () => {
  it("지하철과 버스를 따로 한 줄씩 준다", () => {
    const out = transitLines({
      nearest_station: "망원역 6호선",
      station_walk_min: 7,
      station_distance_m: 470,
      nearest_bus_stop: "망원역2번출구",
      bus_walk_min: 2,
      bus_distance_m: 130,
    });
    expect(out.map((t) => t.icon)).toEqual(["subway", "bus"]);
    expect(out[0]!.title).toBe("망원역 6호선");
    expect(out[0]!.detail).toBe("도보 약 7분 (470m)");
    expect(out[1]!.title).toBe("망원역2번출구 정류장");
  });

  it("거리가 없으면 도보 시간에서 되짚어 보여 준다", () => {
    const [t] = transitLines({ nearest_station: "봉천역", station_walk_min: 9 });
    expect(t!.detail).toBe("도보 약 9분 (603m)");
  });

  it("교통 정보가 아예 없으면 줄을 만들지 않는다", () => {
    expect(transitLines(undefined)).toEqual([]);
    expect(transitLines({})).toEqual([]);
  });
});

describe("commuteLines", () => {
  it("혼자면 '직장'으로만 말한다", () => {
    const out = commuteLines(profile(), 12.3, null);
    expect(out).toEqual([{ who: "직장", where: "서울 강남구", km: 12.3 }]);
  });

  it("배우자 직장을 넣으면 두 줄이 되고 '내 직장'으로 갈라진다", () => {
    const p = profile({ marriage: "married", workplace_partner: { label: "서울 마포구", lat: 37.56, lng: 126.9 } });
    const out = commuteLines(p, 12, 4);
    expect(out.map((c) => c.who)).toEqual(["내 직장", "배우자 직장"]);
    expect(out[1]!.where).toBe("서울 마포구");
  });

  it("예비신혼부부는 '예비 배우자'라고 부른다", () => {
    const p = profile({ marriage: "pre_marriage", workplace_partner: { label: "서울 마포구", lat: 37.56, lng: 126.9 } });
    expect(commuteLines(p, 12, 4)[1]!.who).toBe("예비 배우자 직장");
  });
});

describe("commuteShort", () => {
  it("10km 미만은 소수 한 자리까지 — 3km와 3.8km는 다른 이야기다", () => {
    expect(commuteShort(3.8, null)).toBe("직장까지 직선거리 3.8km");
    expect(commuteShort(12.4, null)).toBe("직장까지 직선거리 12km");
  });

  it("둘 다 있으면 나란히 보여 준다", () => {
    expect(commuteShort(12, 4.2)).toBe("직선거리 직장 12km · 배우자 4.2km");
  });

  it("내 직장만 없으면 배우자 쪽을 말한다", () => {
    expect(commuteShort(null, 4.2)).toBe("배우자 직장까지 직선거리 4.2km");
  });

  it("둘 다 없으면 아무 말도 하지 않는다 (호출한 쪽이 다른 걸 보여 준다)", () => {
    expect(commuteShort(null, null)).toBeNull();
  });

  it("무엇을 잰 값인지 같이 적는다 — '직장 21분'은 걸어서인지 차로인지 알 수 없다", () => {
    expect(commuteShort(12, null, { minutes: 21 })).toBe("직장까지 대중교통 21분");
    expect(commuteShort(null, 8, undefined, { minutes: 34 })).toBe("배우자 직장까지 대중교통 34분");
  });

  it("부부는 재는 방법을 앞에 한 번만 쓴다 — 두 번 쓰면 한 줄이 넘친다", () => {
    expect(commuteShort(12, 8, { minutes: 21 }, { minutes: 34 })).toBe("대중교통 직장 21분 · 배우자 34분");
  });

  it("시간을 알면 거리를 쓰지 않는다", () => {
    expect(commuteShort(12, 8, { minutes: 21 })).toBe("직장까지 대중교통 21분");
  });
});

describe("mapUrl", () => {
  it("좌표가 없으면 지도를 열지 않는다", () => {
    expect(mapUrl({ title: "테스트", lat: undefined, lng: undefined, address: undefined })).toBeNull();
  });

  it("좌표가 있으면 좌표를 그대로 넘긴다", () => {
    const url = mapUrl({ title: "테스트 공고", lat: 37.5586, lng: 126.9095, address: "서울 마포구 망원동" });
    expect(url).toContain("37.5586,126.9095");
  });
});

describe("meters", () => {
  it("1km가 넘으면 km로 — '1213m'는 한눈에 읽히지 않는다", () => {
    expect(meters(351)).toBe("351m");
    expect(meters(999)).toBe("999m");
    expect(meters(1213)).toBe("1.2km");
  });
});
