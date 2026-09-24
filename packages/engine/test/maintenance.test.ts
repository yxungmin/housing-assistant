import { describe, expect, it } from "vitest";
import type { Maintenance } from "@housing/schema";
import { estimateMaintenance, maintenanceSourceLabel } from "../src/index";

const complex: Maintenance = { basis: "complex", complex: "동문디이스트", kapt_code: "B", common_per_m2: 1_234, individual_per_m2: 811, months: ["2025-11", "2026-03", "2026-07"], source: "K-apt 공동주택관리정보시스템" };
const district: Maintenance = { basis: "district", district: "서울 강서구", sample: 5, common_per_m2: 1_100, months: ["2026-07"], source: "K-apt 공동주택관리정보시스템" };

describe("estimateMaintenance", () => {
  it("전용면적 × 단가, 천 원 단위", () => {
    const e = estimateMaintenance(complex, 59.95)!;
    expect(e.common).toBe(74_000); // 1,234 × 59.95 = 73,978
    expect(e.individual).toBe(49_000); // 811 × 59.95 = 48,619
    expect(e.monthly).toBe(123_000);
    expect(e.basis).toBe("complex");
  });

  it("지역 평균에는 개별사용료가 없다", () => {
    const e = estimateMaintenance(district, 26)!;
    expect(e).toMatchObject({ common: 29_000, individual: null, monthly: 29_000, basis: "district" });
  });

  it("정보나 면적이 없으면 추정하지 않는다", () => {
    expect(estimateMaintenance(undefined, 59)).toBeNull();
    expect(estimateMaintenance(complex, undefined)).toBeNull();
    expect(estimateMaintenance(complex, 0)).toBeNull();
  });

  it("근거 문구는 어느 단지·어느 달인지 밝힌다", () => {
    expect(maintenanceSourceLabel(complex)).toBe("동문디이스트 관리비 신고값 · 2025.11월·2026.3월·2026.7월 · K-apt 공동주택관리정보시스템");
    expect(maintenanceSourceLabel(district)).toBe("서울 강서구 5개 단지 단가 중앙값 · 2026.7월 · K-apt 공동주택관리정보시스템");
    expect(maintenanceSourceLabel({ ...district, sample_households: [180, 1200] })).toBe("서울 강서구 5개 단지(180~1,200세대, 이 공고와 비슷한 크기) 단가 중앙값 · 2026.7월 · K-apt 공동주택관리정보시스템");
  });
});
