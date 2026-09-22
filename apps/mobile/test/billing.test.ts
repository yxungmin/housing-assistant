import { describe, expect, it } from "vitest";
import { BILLING_DISCLOSURE, manageSubscriptionUrl, PRICE_TEXT, PRODUCT_ID } from "../src/lib/billing";

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
