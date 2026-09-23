import { describe, expect, it } from "vitest";
import { BILLING_DISCLOSURE, chargeDate, manageSubscriptionUrl, PRICE_TEXT, PRODUCT_ID } from "../src/lib/billing";
import { plannedReminders } from "../src/lib/reminders";
import { toSubscription } from "../src/lib/billing-store";

/**
 * 해지는 앱 안에서 못 한다 (애플·구글 정책). 그래서 "해지" 버튼이 앱 상태만 바꾸면
 * 사용자는 껐다고 믿고 다음 달에 또 결제된다. 보낼 주소를 여기서 고정한다.
 */
describe("스토어 구독 관리 주소", () => {
  it("iOS는 설정의 구독 화면을 연다", () => {
    expect(manageSubscriptionUrl("ios")).toBe("itms-apps://apps.apple.com/account/subscriptions");
  });

  it("안드로이드는 우리 상품을 짚어서 연다", () => {
    const url = manageSubscriptionUrl("android", "com.yxungmin.housingassistant");
    expect(url).toContain("play.google.com/store/account/subscriptions");
    expect(url).toContain(`sku=${PRODUCT_ID}`);
    expect(url).toContain("package=com.yxungmin.housingassistant");
  });

  it("패키지명을 모르면 목록 화면이라도 연다 — 아무 데도 못 가는 것보다 낫다", () => {
    expect(manageSubscriptionUrl("android")).toBe("https://play.google.com/store/account/subscriptions");
  });
});

describe("가격 문구", () => {
  it("한 곳에서만 만든다 — 화면마다 따로 쓰면 하나를 고칠 때 나머지가 남는다", () => {
    expect(PRICE_TEXT).toBe("월 1,900원");
    expect(BILLING_DISCLOSURE).toContain("1,900원");
  });

  it("구매 고지에 자동 결제와 취소가 둘 다 적혀 있다 (App Store 심사 항목)", () => {
    expect(BILLING_DISCLOSURE).toContain("자동");
    expect(BILLING_DISCLOSURE).toContain("취소");
  });
});

/**
 * RevenueCat 응답을 우리 구독 상태로 옮기는 규칙.
 * 스토어를 부르는 코드는 목으로 확인해 봐야 알 게 없지만, 이 변환이 틀리면
 * "구독 중인데 만료로 보이는" 종류의 버그가 조용히 난다.
 */
describe("스토어 응답 → 구독 상태", () => {
  const info = (ent?: { expirationDate?: string | null; willRenew: boolean; periodType: string }) =>
    ({ entitlements: { active: ent ? { paid: ent } : {} } }) as never;

  it("도입 혜택 기간이면 체험 중이다 — 첫 달 무료를 우리가 세지 않는다", () => {
    const s = toSubscription(info({ expirationDate: "2026-10-23T00:00:00Z", willRenew: true, periodType: "TRIAL" }));
    expect(s.status).toBe("trial");
    expect(s.expiresAt).toBe("2026-10-23T00:00:00Z");
  });

  it("정상 기간이면 구독 중", () => {
    expect(toSubscription(info({ willRenew: true, periodType: "NORMAL" })).status).toBe("active");
  });

  it("갱신 예정이 아니면 해지된 것 — 만료일까지는 그대로 쓴다", () => {
    const s = toSubscription(info({ expirationDate: "2026-10-23T00:00:00Z", willRenew: false, periodType: "NORMAL" }));
    expect(s.status).toBe("active");
    expect(s.cancelled).toBe(true);
  });

  it("자격이 없고 쓴 적도 없으면 미구독", () => {
    expect(toSubscription(info()).status).toBe("none");
  });

  it("자격이 없는데 첫 달을 쓴 적이 있으면 만료다 — 미구독과 구분된다", () => {
    expect(toSubscription(info(), { status: "active", firstMonthUsedAt: "2026-08-01" }).status).toBe("expired");
  });

  it("첫 달을 썼다는 기록은 지우지 않는다 — 지우면 무료 달이 다시 생긴다", () => {
    const s = toSubscription(info({ willRenew: true, periodType: "NORMAL" }), { status: "none", firstMonthUsedAt: "2026-08-01" });
    expect(s.firstMonthUsedAt).toBe("2026-08-01");
  });

  // 스토어와 다시 맞춘 상태가 결제 고지까지 그대로 이어지는가 (appState가 켤 때·돌아올 때 맞춘다)
  const now = new Date("2026-10-01T00:00:00Z");
  const charges = (s: ReturnType<typeof toSubscription>) =>
    plannedReminders([], now, { chargeAt: chargeDate(s), priceText: PRICE_TEXT }).filter((r) => r.kind === "charge");

  it("체험 중이면 첫 결제 3일 전 고지가 걸리고 금액이 적힌다", () => {
    const r = charges(toSubscription(info({ expirationDate: "2026-10-23T00:00:00Z", willRenew: true, periodType: "TRIAL" })));
    expect(r).toHaveLength(1);
    expect(r[0]!.body).toContain(PRICE_TEXT);
  });

  it("스토어 설정에서 해지했으면 고지를 걸지 않는다 — 해지한 사람에게 '해지해 주세요'를 보내지 않는다", () => {
    expect(charges(toSubscription(info({ expirationDate: "2026-10-23T00:00:00Z", willRenew: false, periodType: "TRIAL" })))).toHaveLength(0);
  });

  it("첫 결제가 끝나 정상 구독이 되면 더 걸지 않는다 — 고지는 첫 결제 한 번이다", () => {
    expect(charges(toSubscription(info({ expirationDate: "2026-11-23T00:00:00Z", willRenew: true, periodType: "NORMAL" })))).toHaveLength(0);
  });
});
