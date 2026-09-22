/**
 * 구독 상태 규칙 + 결제 어댑터.
 *
 * 첫 달 0원 → 이후 월 1,900원 자동갱신. "첫 1건 무료"는 없앴다 — 무료 제안이 둘이면
 * 사용자가 무엇이 언제 끝나는지 알 수 없다.
 *
 * 자동갱신을 정직하게 파는 조건이 셋 있고, 셋 다 화면에 드러나야 한다:
 *  1. 구매 버튼 **바로 위에** 가격·주기·갱신·취소를 적는다 (App Store 심사 항목).
 *  2. 첫 결제 전에 미리 알린다 (공정위 다크패턴 가이드라인이 "숨은 갱신"을 지목한다).
 *  3. 취소 경로가 1탭이어야 한다. 앱 안에서는 못 끊으므로 스토어 관리 화면으로 보낸다.
 *
 * 스토어 결제(M8)는 어댑터 뒤에 붙인다:
 * 지금은 `mockBilling`(기기 로컬 상태만), 배포 빌드에서는 RevenueCat 또는 react-native-iap 구현으로 교체하고
 * 영수증 검증은 Supabase Edge Function → subscriptions 테이블이 진실 원본이 된다.
 */
export const PRICE_KRW = 1900;
/** 첫 달 0원. "한 달"을 30일로 셈한다 — 스토어 도입 혜택도 P1M 단위다 */
export const TRIAL_DAYS = 30;
/** 만료 후 오프라인 유예 (문서: 캐시된 구독 상태 3일) */
export const GRACE_DAYS = 3;
export const PRODUCT_ID = "housing_assistant_monthly_1900";
/** 첫 결제 며칠 전에 미리 알릴 것인가 */
export const NOTICE_DAYS_BEFORE_CHARGE = 3;

/** "월 1,900원". 가격을 각 화면에서 따로 만들면 하나를 고칠 때 나머지가 남는다 */
export const PRICE_TEXT = `월 ${PRICE_KRW.toLocaleString("ko-KR")}원`;

/** 구매 버튼 위에 그대로 붙는 한 줄. 문구를 여러 화면에 흩어 두면 하나만 고치게 된다. */
export const BILLING_DISCLOSURE = `첫 달 0원, 이후 월 ${PRICE_KRW.toLocaleString("ko-KR")}원이 자동으로 결제돼요. 언제든 취소할 수 있어요.`;

export interface Subscription {
  status: "none" | "trial" | "active" | "expired";
  /** ISO. trial/active의 종료 시각 */
  expiresAt?: string;
  /** 갱신 해지 예약 (만료일까지는 이용 가능) */
  cancelled?: boolean;
  /** 언제 마지막으로 스토어와 맞췄나 */
  syncedAt?: string;
  /**
   * 첫 달 무료를 언제 썼는가. **첫 달만 무료다** — 로그아웃했다 다시 들어오거나
   * 해지 후 재구독해도 다시 주지 않는다. 구독 상태를 갈아끼워도 이 값은 남긴다.
   * 스토어 결제를 붙이면 이 판단은 스토어의 introductory offer 자격이 대신한다.
   */
  firstMonthUsedAt?: string;
}

const DAY = 86_400_000;

/** 저장된 상태를 현재 시각 기준으로 정리한다: 기한(+유예)이 지난 trial/active → expired */
export function normalizeSubscription(sub: Subscription, now = Date.now()): Subscription {
  if ((sub.status === "trial" || sub.status === "active") && sub.expiresAt && Date.parse(sub.expiresAt) + GRACE_DAYS * DAY <= now) {
    return { ...sub, status: "expired" };
  }
  return sub;
}

/** 첫 결제 예정일 (체험 중일 때만). 사전 고지 알림을 여기에 건다 */
export function chargeDate(sub: Subscription): string | null {
  return sub.status === "trial" && sub.expiresAt && !sub.cancelled ? sub.expiresAt : null;
}

/** 첫 달 무료를 아직 쓰지 않았는가. 한 번 쓰면 그 뒤로는 바로 결제다 */
export function canUseFirstMonthFree(sub: Subscription): boolean {
  return !sub.firstMonthUsedAt;
}

export function hasAccess(sub: Subscription, now = Date.now()): boolean {
  const s = normalizeSubscription(sub, now);
  return s.status === "trial" || s.status === "active";
}

/** 남은 일수 (올림). 만료면 0 */
export function daysLeft(sub: Subscription, now = Date.now()): number {
  if (!sub.expiresAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(sub.expiresAt) - now) / DAY));
}

export interface BillingAdapter {
  /** 첫 달 0원 시작 (스토어에서는 introductory offer). 자격 확인은 호출 전에 canUseFirstMonthFree로 한다 */
  startTrial(): Promise<Subscription>;
  /** 월 구독 결제 */
  purchase(): Promise<Subscription>;
  /** 스토어 구매 복원. 없으면 null */
  restore(): Promise<Subscription | null>;
  /** 갱신 해지 (스토어에서는 관리 화면으로 보낸다) */
  cancel(current: Subscription): Promise<Subscription>;
  readonly isMock: boolean;
}

/** 개발·시안 확인용: 기기 로컬 상태만 바꾼다. 결제는 일어나지 않는다. */
export const mockBilling: BillingAdapter = {
  isMock: true,
  async startTrial() {
    return { status: "trial", expiresAt: new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(), syncedAt: new Date().toISOString() };
  },
  async purchase() {
    return { status: "active", expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), syncedAt: new Date().toISOString() };
  },
  async restore() {
    return null;
  },
  async cancel(current) {
    return { ...current, cancelled: true, syncedAt: new Date().toISOString() };
  },
};

// TODO(M8): 스토어 빌드에서는 여기서 RevenueCat 어댑터를 고른다.
export const billing: BillingAdapter = mockBilling;

/**
 * 스토어의 구독 관리 화면.
 *
 * **앱 안에서는 자동갱신을 끊을 수 없다** — 애플·구글 정책이고, 우회할 방법이 없다.
 * 그래서 "갱신 해지" 버튼이 앱 상태만 바꾸면 그건 거짓말이 된다. 사용자는 껐다고 믿고
 * 다음 달에 또 결제되며, 그 시점에 우리가 할 수 있는 해명이 없다.
 *
 * 우리가 지킬 수 있는 약속은 "해지가 1탭 거리에 있다"까지다. 여기로 보낸다.
 */
export function manageSubscriptionUrl(platform: string, packageName?: string): string {
  if (platform === "ios") return "itms-apps://apps.apple.com/account/subscriptions";
  const q = packageName ? `?sku=${PRODUCT_ID}&package=${packageName}` : "";
  return `https://play.google.com/store/account/subscriptions${q}`;
}
