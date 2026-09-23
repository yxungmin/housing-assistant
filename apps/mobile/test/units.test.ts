import { describe, expect, it } from "vitest";
import { manwon } from "../src/lib/format";
import type { SupplyUnit, UserProfile } from "@housing/schema";
import { compareUnits, isScattered, unitLabel, unitRent, unitSpec, unitsWithDistance, priceRange, rangeText, sizeText } from "../src/lib/units";

/** 2026-09-22 실제 행 (강동구 구천면로 317 403호) */
const unit: SupplyUnit = {
  id: "서울특별시 강동구 구천면로 317(암사동,광채빌라) 광채빌라 403",
  address: "서울특별시 강동구 구천면로 317(암사동,광채빌라) 광채빌라",
  ho: "403",
  housing_form: "연립주택",
  exclusive_area_m2: 47.84,
  rooms: 2,
  floor: 4,
  elevator: true,
  deposit: 25_289_000,
  monthly_rent: 476_370,
  rent_options: [
    { tier: "수급자, 지원대상 한부모가족, 차상위계층", max_conversion: false, deposit: 25_289_000, monthly_rent: 476_370 },
    { tier: "수급자, 지원대상 한부모가족, 차상위계층", max_conversion: true, deposit: 82_389_000, monthly_rent: 190_870 },
    { tier: "그 외(소득70%이하)", max_conversion: false, deposit: 25_289_000, monthly_rent: 651_800 },
    { tier: "그 외(소득70%이하)", max_conversion: true, deposit: 103_489_000, monthly_rent: 260_800 },
  ],
  lat: 37.55,
  lng: 127.13,
};

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({ statuses: [], ...over }) as UserProfile;

describe("unitRent", () => {
  it("수급자는 낮은 요율 구간", () => {
    const r = unitRent(unit, profile({ statuses: ["basic_livelihood"] }))!;
    expect(r.monthly_rent).toBe(476_370);
    expect(r.tier).toContain("수급자");
  });

  it("지원대상 한부모가족·차상위도 같은 구간", () => {
    expect(unitRent(unit, profile({ statuses: ["single_parent_support"] }))!.monthly_rent).toBe(476_370);
  });

  it("해당 없으면 그 외 구간 — 같은 집인데 월세가 37% 높다", () => {
    const r = unitRent(unit, profile({ statuses: ["new_worker"] }))!;
    expect(r.monthly_rent).toBe(651_800);
    expect(r.tier).toContain("그 외");
  });

  it("모르면 높은 쪽을 쓴다 — 주거비를 낮게 보여 주는 실수가 더 나쁘다", () => {
    expect(unitRent(unit, null)!.monthly_rent).toBe(651_800);
    expect(unitRent(unit, profile())!.monthly_rent).toBe(651_800);
  });

  it("같은 구간의 최대전환 조건을 같이 준다", () => {
    const r = unitRent(unit, profile({ statuses: ["basic_livelihood"] }))!;
    expect(r.maxConversion).toEqual({ deposit: 82_389_000, monthly_rent: 190_870 });
  });

  it("구간 정보가 없는 예전 데이터는 기본값을 쓴다", () => {
    const old = { ...unit, rent_options: undefined };
    expect(unitRent(old, profile())!.monthly_rent).toBe(476_370);
  });

  it("임대조건이 아예 없으면 null", () => {
    expect(unitRent({ ...unit, rent_options: undefined, deposit: undefined }, profile())).toBeNull();
  });
});

describe("unitLabel · unitSpec", () => {
  it("시도를 빼고 길까지만 — 목록 한 줄에 들어가야 한다", () => {
    expect(unitLabel(unit)).toBe("강동구 구천면로 317");
  });

  it("고를 때 실제로 보는 것들", () => {
    expect(unitSpec(unit)).toBe("4층 · 방 2개 · 전용 47.8㎡ · 승강기");
  });

  it("지하는 그렇게 적는다", () => {
    expect(unitSpec({ ...unit, floor: -1, elevator: false })).toContain("지하 1층");
  });
});

describe("unitsWithDistance", () => {
  const far: SupplyUnit = { ...unit, id: "far", address: "서울특별시 강서구 공항대로 1", lat: 37.56, lng: 126.83 };
  const work = { workplace: { label: "서울 마포구", lat: 37.5663, lng: 126.9019 } } as UserProfile;

  it("직장에서 가까운 순", () => {
    expect(unitsWithDistance([unit, far], work)[0]!.unit.id).toBe("far");
  });

  it("직장이 없으면 보증금이 싼 순 — 고를 기준이 없으면 돈이 기준이다", () => {
    const cheap = { ...unit, id: "cheap", deposit: 1_000_000 };
    expect(unitsWithDistance([unit, cheap], null)[0]!.unit.id).toBe("cheap");
  });

  it("좌표가 없는 집은 거리를 지어내지 않는다", () => {
    const noGeo = { ...unit, id: "nogeo", lat: undefined, lng: undefined };
    expect(unitsWithDistance([noGeo], work)[0]!.km).toBeNull();
  });
});

describe("isScattered", () => {
  it("주택 목록이 있으면 흩어진 공고", () => {
    expect(isScattered({ units: [unit] })).toBe(true);
  });

  it("주소가 시도까지면 한 채의 주소가 아니라 관할 구역이다", () => {
    expect(isScattered({ address: "서울특별시" })).toBe(true);
  });

  it("시군구가 있으면 한 곳을 가리킨다", () => {
    expect(isScattered({ address: "서울특별시 강서구 공항대로81길 14" })).toBe(false);
  });
});

describe("compareUnits", () => {
  const mk = (over: Partial<SupplyUnit>, km: number | null) => ({ unit: { ...unit, ...over } as SupplyUnit, km });
  const near = mk({ id: "near", exclusive_area_m2: 30, deposit: 50_000_000 }, 2);
  const far = mk({ id: "far", exclusive_area_m2: 60, deposit: 10_000_000 }, 20);

  it("가까운 순이 기본", () => {
    expect([far, near].sort((a, b) => compareUnits("near", a, b))[0]!.unit.id).toBe("near");
  });

  it("넓은 순", () => {
    expect([near, far].sort((a, b) => compareUnits("large", a, b))[0]!.unit.id).toBe("far");
  });

  it("보증금 낮은 순", () => {
    expect([near, far].sort((a, b) => compareUnits("cheap", a, b))[0]!.unit.id).toBe("far");
  });

  it("값이 없는 집은 그 기준에서 맨 뒤 — 없는 값을 0으로 두면 맨 앞에 선다", () => {
    const blank = mk({ id: "blank", exclusive_area_m2: undefined, deposit: undefined }, null);
    expect([blank, near].sort((a, b) => compareUnits("cheap", a, b))[0]!.unit.id).toBe("near");
    expect([blank, near].sort((a, b) => compareUnits("large", a, b))[0]!.unit.id).toBe("near");
    expect([blank, near].sort((a, b) => compareUnits("near", a, b))[0]!.unit.id).toBe("near");
  });

  it("넓이가 같으면 가까운 쪽이 먼저", () => {
    const a = mk({ id: "a", exclusive_area_m2: 40 }, 10);
    const b = mk({ id: "b", exclusive_area_m2: 40 }, 3);
    expect([a, b].sort((x, y) => compareUnits("large", x, y))[0]!.unit.id).toBe("b");
  });
});

/**
 * 매입임대는 집이 수백 채씩 오고 값이 제각각이다. 화면은 가까운 세 곳만 보여 주므로
 * 범위가 없으면 "이 공고는 대충 얼마인가"에 답하지 못한다.
 */
describe("가격 범위", () => {
  const u = (deposit?: number, monthly_rent?: number): SupplyUnit =>
    ({ id: `${deposit}-${monthly_rent}`, address: "x", deposit, monthly_rent }) as SupplyUnit;

  it("최소와 최대를 준다", () => {
    const r = priceRange([u(1_000_000, 300_000), u(5_000_000, 800_000), u(3_000_000, 500_000)], null);
    expect(r?.deposit).toEqual([1_000_000, 5_000_000]);
    expect(r?.monthly_rent).toEqual([300_000, 800_000]);
    expect(r?.count).toBe(3);
  });

  it("값이 하나뿐이면 범위로 적지 않는다 — '100만~100만'은 읽는 사람을 속인다", () => {
    expect(rangeText([1_000_000, 1_000_000], manwon)).toBe(manwon(1_000_000));
  });

  it("월세 0원인 집(전세형)도 범위에 넣는다 — 빼면 0원인 집이 숨는다", () => {
    const r = priceRange([u(100_000_000, 0), u(10_000_000, 500_000)], null);
    expect(r?.monthly_rent).toEqual([0, 500_000]);
  });

  it("가격이 없는 집만 있으면 범위를 지어내지 않는다", () => {
    expect(priceRange([u(undefined, undefined)], null)).toBeNull();
    expect(priceRange([], null)).toBeNull();
    expect(priceRange(undefined, null)).toBeNull();
  });
});

describe("sizeText", () => {
  const ex = (types: { name: string; exclusive_area_m2?: number }[]) => ({ tracks: [{ unit_types: types }] });
  it("주택형 코드 대신 전용면적 범위", () => {
    expect(sizeText({ extraction: ex([{ name: "일도 16A", exclusive_area_m2: 16.64 }, { name: "삼도1 26A", exclusive_area_m2: 26.94 }]) })).toBe("전용 17~27㎡");
  });
  it("면적이 하나면 범위로 쓰지 않는다", () => {
    expect(sizeText({ extraction: ex([{ name: "59A", exclusive_area_m2: 59.95 }, { name: "59A", exclusive_area_m2: 59.95 }]) })).toBe("전용 60㎡");
  });
  it("면적이 없으면 예전처럼 코드로", () => {
    expect(sizeText({ extraction: ex([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]) })).toBe("A · B · C 외 1");
  });
  it("흩어진 집은 집마다의 면적으로", () => {
    const units = [{ exclusive_area_m2: 19.2 }, { exclusive_area_m2: 44.8 }] as unknown as SupplyUnit[];
    expect(sizeText({ units, extraction: ex([]) })).toBe("전용 19~45㎡");
  });
});
