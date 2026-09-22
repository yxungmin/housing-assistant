import { describe, expect, it } from "vitest";
import { originFor } from "../src/data/transit";

/**
 * 직장 좌표는 기기를 떠날 때 100m로 뭉개진다. 약관에 "100m 단위"라고 적으려면
 * 실제로 그래야 한다 — 문서와 코드가 다르면 문서가 거짓말이 된다.
 */
describe("출발 좌표 정밀도", () => {
  const p = (lat: number, lng: number) => ({ workplace: { name: "강남역", lat, lng } }) as never;

  it("소수 3자리로 뭉갠다", () => {
    expect(originFor(p(37.497942, 127.027621))).toEqual({ lat: 37.498, lng: 127.028 });
  });

  /**
   * "가까운 두 점이 같은 값이 된다"는 사실이 아니다 — 격자 경계를 사이에 두면 갈린다.
   * 실제로 보장되는 것은 **어느 점이든 원래 자리에서 50m 안쪽으로만 바뀐다**는 것,
   * 즉 서버로 나가는 값이 100m 격자 위에만 존재한다는 것이다. 그쪽을 고정한다.
   */
  it("어떤 좌표든 100m 격자 위로만 나간다", () => {
    for (const [lat, lng] of [
      [37.49781, 127.02742],
      [37.49823, 127.02758],
      [35.15949, 129.16003],
      [-1.00049, 0.0005],
    ] as const) {
      const out = originFor(p(lat, lng))!;
      expect(Math.abs(out.lat - lat)).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(out.lng - lng)).toBeLessThanOrEqual(0.0005);
      expect(out.lat).toBe(Number(out.lat.toFixed(3)));
      expect(out.lng).toBe(Number(out.lng.toFixed(3)));
    }
  });

  it("건물 단위 정밀도는 남지 않는다 — 소수 4자리 이하가 사라진다", () => {
    expect(originFor(p(37.497942, 127.027621))).toEqual(originFor(p(37.497988, 127.027551)));
  });

  it("직장이 없으면 아무것도 보내지 않는다", () => {
    expect(originFor(null)).toBeNull();
    expect(originFor(undefined)).toBeNull();
    expect(originFor({} as never)).toBeNull();
  });
});
