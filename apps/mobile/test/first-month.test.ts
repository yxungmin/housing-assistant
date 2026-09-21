import { describe, expect, it } from "vitest";
import { canUseFirstMonthFree, hasAccess, normalizeSubscription, type Subscription } from "../src/lib/billing";

/**
 * 첫 달만 무료다. 로그아웃 후 재로그인, 해지 후 재구독으로 무료 달이 다시 생기면 안 된다.
 * 기록은 subscription.firstMonthUsedAt에 남고 구독 상태를 갈아끼워도 지워지지 않는다.
 */
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe("canUseFirstMonthFree", () => {
  it("아직 안 썼으면 쓸 수 있다", () => {
    expect(canUseFirstMonthFree({ status: "none" })).toBe(true);
  });

  it("한 번 쓰면 상태와 무관하게 다시 못 쓴다", () => {
    const used = "2026-09-21T00:00:00.000Z";
    expect(canUseFirstMonthFree({ status: "trial", expiresAt: inDays(30), firstMonthUsedAt: used })).toBe(false);
    expect(canUseFirstMonthFree({ status: "expired", firstMonthUsedAt: used })).toBe(false);
    expect(canUseFirstMonthFree({ status: "none", firstMonthUsedAt: used })).toBe(false);
    expect(canUseFirstMonthFree({ status: "active", expiresAt: inDays(30), firstMonthUsedAt: used })).toBe(false);
  });
});

describe("첫 달 무료 기록 유지", () => {
  /** appState의 setSubscription이 하는 일과 같은 규칙 */
  const apply = (prev: Subscription, next: Subscription): Subscription => {
    const n = normalizeSubscription(next);
    const firstMonthUsedAt = prev.firstMonthUsedAt ?? (n.status === "trial" ? new Date().toISOString() : undefined);
    return firstMonthUsedAt ? { ...n, firstMonthUsedAt } : n;
  };

  it("무료 달을 시작하면 그 시점을 찍는다", () => {
    const after = apply({ status: "none" }, { status: "trial", expiresAt: inDays(30) });
    expect(after.firstMonthUsedAt).toBeTruthy();
    expect(canUseFirstMonthFree(after)).toBe(false);
  });

  it("만료·재결제·해지를 거쳐도 기록이 남는다", () => {
    let sub = apply({ status: "none" }, { status: "trial", expiresAt: inDays(30) });
    const used = sub.firstMonthUsedAt;
    sub = apply(sub, { status: "expired" });
    expect(sub.firstMonthUsedAt).toBe(used);
    sub = apply(sub, { status: "active", expiresAt: inDays(30) });
    expect(sub.firstMonthUsedAt).toBe(used);
    expect(canUseFirstMonthFree(sub)).toBe(false);
  });

  it("두 번째 무료 달 시도는 기록을 덮어쓰지 않는다", () => {
    const first = apply({ status: "none" }, { status: "trial", expiresAt: inDays(30) });
    const again = apply({ ...first, status: "expired" }, { status: "trial", expiresAt: inDays(30) });
    expect(again.firstMonthUsedAt).toBe(first.firstMonthUsedAt);
  });

  it("무료 달을 쓴 적 없으면 기록을 만들지 않는다", () => {
    expect(apply({ status: "none" }, { status: "none" }).firstMonthUsedAt).toBeUndefined();
  });
});

describe("hasAccess", () => {
  it("첫 달 무료를 썼는지와 이용 가능 여부는 별개다", () => {
    const used = "2026-09-21T00:00:00.000Z";
    expect(hasAccess({ status: "active", expiresAt: inDays(10), firstMonthUsedAt: used })).toBe(true);
    expect(hasAccess({ status: "expired", firstMonthUsedAt: used })).toBe(false);
  });
});
