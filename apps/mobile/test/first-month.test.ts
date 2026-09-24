import { describe, expect, it } from "vitest";
import { canUseFirstMonthFree, hasAccess, recordFirstMonth, type Subscription } from "../src/lib/billing";

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
  /** appState의 setSubscription이 그대로 부르는 함수 — 복사본이 아니다 */
  const apply = (prev: Subscription, next: Subscription): Subscription => recordFirstMonth(prev, next);

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

  it("유료로 쓴 적이 있으면 그것도 기록이다 — 만료 뒤 '첫 달 0원'을 다시 보이지 않는다", () => {
    const paid = apply({ status: "none" }, { status: "active", expiresAt: inDays(30) });
    expect(paid.firstMonthUsedAt).toBeDefined();
    expect(canUseFirstMonthFree({ ...paid, status: "expired" })).toBe(false);
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

describe("초기화·재설치에도 남는가", () => {
  /** appState의 reset이 하는 일과 같은 규칙 */
  const afterReset = (sub: Subscription): Subscription =>
    sub.firstMonthUsedAt ? { status: "none", firstMonthUsedAt: sub.firstMonthUsedAt } : { status: "none" };

  it("모든 데이터 지우고 처음부터 해도 무료 달이 다시 생기지 않는다", () => {
    const used = { status: "trial" as const, expiresAt: inDays(30), firstMonthUsedAt: "2026-09-21T00:00:00.000Z" };
    const after = afterReset(used);
    expect(after.status).toBe("none");
    expect(canUseFirstMonthFree(after)).toBe(false);
  });

  it("쓴 적 없으면 초기화 후에도 쓸 수 있다", () => {
    expect(canUseFirstMonthFree(afterReset({ status: "none" }))).toBe(true);
  });

  /** hydrate가 별도 키로 기록을 되살리는 규칙 */
  const hydrate = (meta: Subscription | undefined, stored: string | null): Subscription => {
    const sub = meta ?? { status: "none" as const };
    return stored ? { ...sub, firstMonthUsedAt: sub.firstMonthUsedAt ?? stored } : sub;
  };

  it("meta가 지워져도 별도 키가 남아 있으면 되살린다", () => {
    const revived = hydrate(undefined, "2026-09-21T00:00:00.000Z");
    expect(canUseFirstMonthFree(revived)).toBe(false);
  });

  it("별도 키가 없으면 그대로 쓸 수 있다", () => {
    expect(canUseFirstMonthFree(hydrate(undefined, null))).toBe(true);
  });
});
