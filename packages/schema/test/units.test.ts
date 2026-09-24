import { describe, expect, it } from "vitest";
import { deflateUnits, inflateUnits, type SupplyUnit } from "../src";

const transit = { nearest_station: "암사역 8호선", station_distance_m: 694, station_walk_min: 10 };
const nearby = [{ kind: "mart" as const, name: "마트", distance_m: 120 }];
const units: SupplyUnit[] = [
  { id: "a-101", address: "서울 강동구 A로 1", ho: "101", lat: 37.5, lng: 127.1, transit, nearby },
  { id: "a-102", address: "서울 강동구 A로 1", ho: "102", lat: 37.5, lng: 127.1, transit, nearby },
  { id: "b-201", address: "서울 강동구 B로 2", ho: "201", lat: 37.6, lng: 127.2 },
  { id: "c-301", address: "서울 강동구 C로 3", ho: "301" },
];

describe("unit_places", () => {
  it("주소마다 한 벌만 남기고 집에서는 뗀다", () => {
    const { units: stripped, unit_places } = deflateUnits(units);
    expect(Object.keys(unit_places)).toEqual(["서울 강동구 A로 1", "서울 강동구 B로 2"]);
    expect(unit_places["서울 강동구 A로 1"]).toEqual({ lat: 37.5, lng: 127.1, transit, nearby });
    expect(stripped.every((u) => u.lat === undefined && u.transit === undefined && u.nearby === undefined)).toBe(true);
    expect(stripped[0]).toEqual({ id: "a-101", address: "서울 강동구 A로 1", ho: "101" });
  });

  it("다시 붙이면 원래와 같다. 표에 없는 집은 좌표 없이 그대로", () => {
    const { units: stripped, unit_places } = deflateUnits(units);
    expect(inflateUnits(stripped, unit_places)).toEqual(units);
    expect(inflateUnits(stripped, undefined)).toEqual(stripped);
  });
});
