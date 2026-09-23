/**
 * 스토어 결제 어댑터 (RevenueCat).
 *
 * `BillingAdapter` 뒤에 끼우는 구현이다. 화면 코드는 이걸 모른다 —
 * `billing.ts`의 마지막 줄만 바뀐다.
 *
 * **첫 달 무료를 우리가 세지 않는다.** 지금은 `firstMonthUsedAt`으로 기기에 기록하는데,
 * 그건 앱을 지웠다 깔면 초기화되고 기기를 바꾸면 또 준다. 스토어의 도입 혜택
 * (introductory offer)은 Apple ID / 구글 계정 단위로 자격을 판정하므로 더 정확하고
 * 우회하기 어렵다. 그래서 `startTrial`도 그냥 구매를 부른다 — 첫 달이 0원인지는
 * 스토어가 정한다.
 *
 * 로그인과 잇는 이유: Supabase user id를 `logIn`에 넘겨야 아이폰에서 산 구독이
 * 안드로이드에서도 보인다. 안 넘기면 기기마다 다른 익명 id가 생겨 구독이 따라오지 않는다.
 */
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import { Platform } from "react-native";
import type { BillingAdapter, StorePrice, Subscription } from "./billing";

/** RevenueCat 대시보드에서 만드는 자격 이름. 상품이 여럿이어도 앱은 이것만 본다 */
export const ENTITLEMENT = "paid";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export const storeBillingConfigured = !!(Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY);

let started = false;

/** 앱이 켜질 때 한 번. 키가 없으면 아무것도 하지 않는다 (개발 빌드에서 목으로 돈다) */
export function initStoreBilling(): void {
  if (started || !storeBillingConfigured) return;
  started = true;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: (Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY)! });
}

/**
 * 로그인·로그아웃을 스토어에도 알린다.
 * 이걸 빠뜨리면 기기마다 익명 id가 생겨 구독이 계정을 따라다니지 않는다.
 */
export async function linkStoreAccount(userId: string | null): Promise<void> {
  if (!storeBillingConfigured) return;
  try {
    if (userId) await Purchases.logIn(userId);
    else await Purchases.logOut();
  } catch {
    // 결제 연결이 실패해도 로그인 자체는 성사돼야 한다. 다음 구매·복원에서 다시 맞춰진다.
  }
}

/** RevenueCat의 CustomerInfo → 우리 구독 상태 */
export function toSubscription(info: CustomerInfo, prev?: Subscription): Subscription {
  const ent = info.entitlements.active[ENTITLEMENT];
  const expiresAt = ent?.expirationDate ?? undefined;
  // 갱신 예정이 아니면 해지된 것이다. 만료일까지는 그대로 쓴다.
  const cancelled = ent ? !ent.willRenew : undefined;
  // periodType이 도입 혜택이면 체험 중이다 — 우리가 세지 않고 스토어 판정을 그대로 쓴다
  const trial = ent?.periodType === "TRIAL" || ent?.periodType === "INTRO";
  return {
    status: ent ? (trial ? "trial" : "active") : prev?.firstMonthUsedAt ? "expired" : "none",
    ...(expiresAt ? { expiresAt } : {}),
    ...(cancelled !== undefined ? { cancelled } : {}),
    syncedAt: new Date().toISOString(),
    ...(prev?.firstMonthUsedAt ? { firstMonthUsedAt: prev.firstMonthUsedAt } : {}),
  };
}

/**
 * 스토어가 아는 지금 상태로 다시 맞춘다. 켤 때·앱으로 돌아올 때·SDK가 바뀌었다고 알릴 때.
 *
 * 구매할 때 한 번 받은 상태만 들고 있으면 두 가지가 틀어진다.
 *  - **갱신이 안 보인다.** 첫 달이 끝나고 결제가 돼도 기기의 만료일은 그대로라, 30일 + 유예 3일 뒤
 *    돈을 낸 사람이 잠긴다.
 *  - **해지가 안 보인다.** 해지는 스토어 설정에서 한다(앱 안에서는 못 한다). 그걸 모르면
 *    이미 해지한 사람에게 "3일 뒤 첫 결제예요, 해지해 주세요" 알림이 간다.
 *
 * 스토어를 못 부르면(오프라인 등) null — 기기에 있던 상태를 그대로 둔다. 모른다고 잠그지 않는다.
 */
export async function readStoreSubscription(prev: Subscription): Promise<Subscription | null> {
  if (!storeBillingConfigured) return null;
  try {
    return toSubscription(await Purchases.getCustomerInfo(), prev);
  } catch {
    return null;
  }
}

/** SDK가 새 구독 정보를 받을 때마다(구매·복원·계정 전환·백그라운드 갱신). 해제 함수를 돌려준다 */
export function onStoreSubscriptionChange(prev: () => Subscription, next: (s: Subscription) => void): () => void {
  if (!storeBillingConfigured) return () => {};
  const listener = (info: CustomerInfo) => next(toSubscription(info, prev()));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => void Purchases.removeCustomerInfoUpdateListener(listener);
}

/** 판매 중인 월 구독의 스토어 가격. 못 받으면 null — 화면은 PRICE_KRW로 적는다 (billing.ts priceParts) */
export async function readStorePrice(): Promise<StorePrice | null> {
  if (!storeBillingConfigured) return null;
  try {
    const product = (await Purchases.getOfferings()).current?.availablePackages[0]?.product;
    return product ? { price: product.price, currencyCode: product.currencyCode, priceString: product.priceString } : null;
  } catch {
    return null;
  }
}

async function buy(): Promise<Subscription> {
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages[0];
  if (!pkg) throw new Error("판매 중인 상품이 없어요");
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return toSubscription(customerInfo);
}

export const storeBilling: BillingAdapter = {
  isMock: false,
  // 첫 달이 0원인지는 스토어가 정한다. 우리는 같은 구매를 부른다.
  startTrial: buy,
  purchase: buy,
  async restore() {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[ENTITLEMENT] ? toSubscription(info) : null;
  },
  async cancel(current) {
    // 앱 안에서 자동갱신을 끊을 수 없다. 화면이 스토어 관리로 보낸다 (billing.ts의 manageSubscriptionUrl).
    return current;
  },
};
