import { describe, expect, it } from "vitest";
import type { Subscription } from "../src/lib/billing";
import { accessLevel, canOpenCost, canSeeAnnouncement, shouldGate, type Account } from "../src/lib/access";

const account: Account = { id: "u1", provider: "kakao", signedInAt: "2026-09-21T00:00:00.000Z" };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const trial: Subscription = { status: "trial", expiresAt: inDays(30) };
const expired: Subscription = { status: "expired" };

describe("accessLevel", () => {
  it("로그인 전에는 게이트", () => {
    expect(accessLevel({ account: null, subscription: trial })).toBe("gate");
  });

  it("첫 달 0원 중에는 전부 열린다", () => {
    expect(accessLevel({ account, subscription: trial })).toBe("full");
  });

  it("구독이 끝나면 만료", () => {
    expect(accessLevel({ account, subscription: expired })).toBe("expired");
  });

  it("기한이 지난 체험은 저장된 status와 무관하게 만료로 본다 (유예 포함)", () => {
    const stale: Subscription = { status: "trial", expiresAt: inDays(-10) };
    expect(accessLevel({ account, subscription: stale })).toBe("expired");
  });
});

describe("만료 후에도 뺏지 않는 것", () => {
  const base = { account, subscription: expired, saved: ["saved-1"] };

  it("저장한 공고는 만료 후에도 열린다 — 마감을 놓치게 하면 안 된다", () => {
    expect(canSeeAnnouncement(base, "saved-1")).toBe(true);
  });

  it("저장하지 않은 공고는 만료 후 가린다", () => {
    expect(canSeeAnnouncement(base, "new-1")).toBe(false);
  });

  it("구독 중에는 저장 여부와 무관하게 다 보인다", () => {
    expect(canSeeAnnouncement({ ...base, subscription: trial }, "new-1")).toBe(true);
  });

  it("로그인 전에는 저장한 것도 없고 아무것도 안 보인다", () => {
    expect(canSeeAnnouncement({ account: null, subscription: trial, saved: ["saved-1"] }, "saved-1")).toBe(false);
  });
});

describe("비용 계산", () => {
  it("구독 중에만 계산한다", () => {
    expect(canOpenCost({ account, subscription: trial })).toBe(true);
  });

  it("만료 후에는 저장한 공고라도 새로 계산하지 않는다", () => {
    expect(canOpenCost({ account, subscription: expired })).toBe(false);
  });
});

describe("게이트를 띄울지", () => {
  it("맞는 공고가 있으면 띄운다", () => {
    expect(shouldGate("gate", 5)).toBe(true);
  });

  it("맞는 공고가 0개면 로그인을 요구하지 않는다 — 빈 걸 가리고 가입을 받는 건 사기다", () => {
    expect(shouldGate("gate", 0)).toBe(false);
  });

  it("이미 로그인했으면 띄우지 않는다", () => {
    expect(shouldGate("full", 5)).toBe(false);
    expect(shouldGate("expired", 5)).toBe(false);
  });
});
