/**
 * 무엇을 보여 주고 무엇을 가릴지.
 *
 * **조건 매칭은 무료, 자금 계산은 유료** (2026-09-21 확정).
 * "이 공고가 나한테 맞나"는 갈아탈 이유라 공짜로 준다. 기기에서 돌아 한계비용이 0이고,
 * 이걸 잠그면 무료 티어가 경쟁 앱보다 못한 것이 되어 돈을 낼지 판단하기 전에 지운다.
 * "그래서 내 돈으로 되나"에서 받는다.
 *
 * 그래서 구독이 끝나도 목록과 조건 일치는 그대로 보인다. 막는 것은 비용 계산뿐이다.
 *
 * 로그인은 다른 축이다. 맞춤 공고는 내 조건이 있어야 성립하므로 로그인이 목록 앞에 선다.
 * 다만 선을 넘지 않는 규칙이 둘 있다.
 *
 *  1. **마감 알림은 끊지 않는다.** 돈을 안 낸다고 마감을 놓치게 하면 그건 해를 끼치는 것이다.
 *  2. **빈 걸 가리고 로그인을 받지 않는다.** 맞는 공고가 0개면 게이트를 띄우지 않는다.
 */
import { hasAccess, type Subscription } from "./billing";

/** 모의 계정. 실제 인증(Supabase Auth 카카오·Apple)은 아직 붙이지 않았다 */
export interface Account {
  id: string;
  provider: "kakao" | "apple" | "google";
  signedInAt: string;
}

export type AccessLevel =
  /** 로그인 전 — 개수만 보여 주고 목록은 가린다 */
  | "gate"
  /** 첫 달 0원 또는 구독 중 */
  | "full"
  /** 구독이 끝났다 — 저장한 공고는 그대로, 새 공고는 가린다 */
  | "expired";

export function accessLevel(input: { account: Account | null; subscription: Subscription }, now = Date.now()): AccessLevel {
  if (!input.account) return "gate";
  return hasAccess(input.subscription, now) ? "full" : "expired";
}

/**
 * 이 공고의 조건을 보여 줘도 되는가. 로그인만 하면 구독과 무관하게 보인다 —
 * 조건 매칭은 무료다. announcementId·saved는 쓰지 않지만 호출부를 그대로 두려고 남긴다.
 */
export function canSeeAnnouncement(
  input: { account: Account | null; subscription: Subscription; saved: string[] },
  announcementId?: string,
  now = Date.now(),
): boolean {
  void announcementId;
  return accessLevel(input, now) !== "gate";
}

/** 비용 계산은 구독 중에만 — 여기가 유료선이다. 만료 후에는 저장한 공고라도 새로 계산하지 않는다 */
export const canOpenCost = (input: { account: Account | null; subscription: Subscription }, now = Date.now()): boolean =>
  accessLevel(input, now) === "full";

/**
 * 게이트를 띄울지. 맞는 공고가 0개면 로그인을 요구하지 않는다 —
 * 비어 있는 걸 가리고 가입을 받는 건 사기다.
 */
export const shouldGate = (level: AccessLevel, matchedCount: number): boolean => level === "gate" && matchedCount > 0;
