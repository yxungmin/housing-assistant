import { describe, expect, it } from "vitest";
import type { SupplyUnit } from "@housing/schema";
import { distancesTo } from "../src/lib/units";
import { nearestHouseShort } from "../src/lib/commute";

const cityHall = { lat: 37.5665, lng: 126.978 };
const euljiro = { lat: 37.566, lng: 126.9826 }; // 을지로입구역, 시청에서 0.4km
const mapo = { lat: 37.5586, lng: 126.9095 }; // 마포구, 을지로에서 약 6.5km
const gangdong = { lat: 37.5301, lng: 127.1238 }; // 강동구, 을지로에서 약 13km

const unit = (id: string, at: { lat: number; lng: number }) => ({ id, address: id, ...at }) as unknown as SupplyUnit;

describe("distancesTo", () => {
  it("한 단지 공고는 공고 좌표로 잰다", () => {
    const d = distancesTo({ address: "서울특별시 관악구 봉천동 180", ...mapo }, euljiro, null, null);
    expect(d.nearestHouse).toBe(false);
    expect(d.work).toBeGreaterThan(6);
  });

  it("관할 구역만 적힌 공고는 대표점(시청)으로 재지 않는다 — '직장까지 0.3km'가 여기서 나왔다", () => {
    const d = distancesTo({ address: "서울특별시", ...cityHall }, euljiro, null, cityHall);
    expect(d).toEqual({ work: null, partner: null, home: null, nearestHouse: true });
  });

  it("흩어진 공고는 가장 가까운 집으로 잰다", () => {
    const d = distancesTo({ address: "서울특별시", ...cityHall, units: [unit("a", gangdong), unit("b", mapo)] }, euljiro, null, null);
    expect(d.nearestHouse).toBe(true);
    expect(d.work).toBeGreaterThan(6);
    expect(d.work).toBeLessThan(7);
  });

  it("부부는 두 사람 모두에게 가까운 집 하나를 고르고, 그 집 기준으로 둘 다 적는다", () => {
    // 마포 집: 나 6.5km / 배우자 0km → 먼 쪽 6.5km
    // 강동 집: 나 13km / 배우자 19km → 먼 쪽 19km
    const d = distancesTo({ units: [unit("a", gangdong), unit("b", mapo)] }, euljiro, mapo, null);
    expect(d.partner).toBeLessThan(0.01);
    expect(d.work).toBeGreaterThan(6);
    expect(d.work).toBeLessThan(7);
  });

  it("집 좌표가 하나도 없으면 거리를 말하지 않는다", () => {
    const d = distancesTo({ units: [{ id: "x", address: "x" } as unknown as SupplyUnit] }, euljiro, null, null);
    expect(d.work).toBeNull();
  });
});

describe("nearestHouseShort", () => {
  it("공고가 아니라 가장 가까운 집까지라는 걸 밝혀 적는다", () => {
    expect(nearestHouseShort(1.23, null)).toBe("직장에서 가장 가까운 집 직선 1.2km");
    expect(nearestHouseShort(1.2, 3.4)).toBe("가까운 집까지 직선 직장 1.2km · 배우자 3.4km");
    expect(nearestHouseShort(null, null)).toBeNull();
  });
});
