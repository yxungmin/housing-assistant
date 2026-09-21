import { describe, expect, it } from "vitest";
import type { LoanProduct, UserProfile } from "@housing/schema";
import type { Announcement } from "../src/data/announcements";
import { fundsFor, fundsNote } from "../src/lib/funds";

const src = { page: 1, text: "x" };

const price = (unit_type: string, deposit: number) => ({
  unit_type,
  kind: "rental" as const,
  deposit,
  monthly_rent: 300_000,
  maintenance_estimate: 100_000,
  source: src,
});

const announcement = (pricing: ReturnType<typeof price>[]): Announcement =>
  ({
    id: "a1",
    lh_id: "T-1",
    title: "테스트",
    housing_type: "long_term_rental",
    region_code: "11",
    region_name: "서울",
    status: "AUTO",
    extraction: {
      title: "테스트",
      housing_type: "long_term_rental",
      schedule: {},
      notes: [],
      tracks: [{ name: "일반", unit_types: [], rule_groups: [], rules: [], pricing }],
    },
  }) as unknown as Announcement;

const profile = (cash: number | undefined): UserProfile => ({ cash_on_hand: cash, age: 30 }) as UserProfile;
/** 대출이 없으면 보증금 전액을 현금으로 내야 한다 — 계산을 단순하게 두려고 빈 목록을 쓴다 */
const NO_LOANS: LoanProduct[] = [];

describe("fundsFor", () => {
  it("가장 싼 방으로도 모자라면 short", () => {
    const f = fundsFor(announcement([price("59㎡", 300_000_000), price("39㎡", 200_000_000)]), profile(50_000_000), NO_LOANS);
    expect(f.status).toBe("short");
    expect(f.shortfall).toBe(150_000_000);
    expect(f.unitLabel).toBe("39㎡");
  });

  it("가장 싼 방을 기준으로 본다 — 비싼 방으로 재면 갈 수 있는 사람에게 겁을 준다", () => {
    const f = fundsFor(announcement([price("59㎡", 300_000_000), price("39㎡", 100_000_000)]), profile(120_000_000), NO_LOANS);
    expect(f.status).toBe("ok");
    expect(f.shortfall).toBe(0);
  });

  it("보유 현금을 안 넣었으면 판단하지 않는다", () => {
    expect(fundsFor(announcement([price("39㎡", 100_000_000)]), profile(undefined), NO_LOANS).status).toBe("unknown");
  });

  it("프로필이 없으면 판단하지 않는다", () => {
    expect(fundsFor(announcement([price("39㎡", 1)]), null, NO_LOANS).status).toBe("unknown");
  });

  it("임대조건을 못 읽은 공고는 판단하지 않는다", () => {
    expect(fundsFor(announcement([]), profile(10_000_000), NO_LOANS).status).toBe("unknown");
  });

  it("딱 맞으면 부족이 아니다", () => {
    const f = fundsFor(announcement([price("39㎡", 100_000_000)]), profile(100_000_000), NO_LOANS);
    expect(f.status).toBe("ok");
  });
});

describe("fundsNote", () => {
  it("부족할 때만 한 줄을 준다", () => {
    expect(fundsNote({ status: "short", shortfall: 1 })).toBe("현금이 부족할 수 있어요");
  });

  it("금액은 넣지 않는다 — 그건 유료다", () => {
    expect(fundsNote({ status: "short", shortfall: 150_000_000 })).not.toMatch(/\d/);
  });

  it("마련할 수 있거나 모르면 아무 말도 하지 않는다", () => {
    expect(fundsNote({ status: "ok", shortfall: 0 })).toBeNull();
    expect(fundsNote({ status: "unknown", shortfall: 0 })).toBeNull();
  });
});
