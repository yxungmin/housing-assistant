/**
 * 테스트용 대역. `react-native-purchases`는 네이티브 모듈이라 vitest가 읽지 못한다
 * (`react-native` 본체를 react-native-web으로 바꿔 끼우는 것과 같은 이유).
 *
 * 결제 자체는 여기서 검증하지 않는다 — 스토어를 부르는 코드라 목으로 확인해 봐야
 * 알 수 있는 게 거의 없다. 대신 **응답을 우리 구독 상태로 옮기는 규칙**(`toSubscription`)은
 * 순수 함수라 테스트한다. 그게 틀리면 "구독 중인데 만료로 보이는" 종류의 버그가 난다.
 */
export enum LOG_LEVEL {
  DEBUG = "DEBUG",
  ERROR = "ERROR",
}

const notUsed = () => {
  throw new Error("테스트에서 스토어를 부르지 않는다");
};

export default {
  setLogLevel: () => {},
  configure: () => {},
  logIn: notUsed,
  logOut: notUsed,
  getOfferings: notUsed,
  purchasePackage: notUsed,
  restorePurchases: notUsed,
  getCustomerInfo: notUsed,
  addCustomerInfoUpdateListener: notUsed,
  removeCustomerInfoUpdateListener: notUsed,
};

export type CustomerInfo = {
  entitlements: { active: Record<string, { expirationDate?: string | null; willRenew: boolean; periodType: string } | undefined> };
};
