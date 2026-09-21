/**
 * 무엇을 보여 주고 무엇을 가릴지.
 *
 * 맞춤 공고가 제품 자체다 — 목록은 이미 내 조건으로 걸러진 결과이고, 걸러지지 않은 목록은 앱에 없다.
 * 그래서 로그인·구독이 목록 앞에 선다. 다만 선을 넘지 않는 규칙이 셋 있다.
 *
 *  1. **이미 본 것은 뺏지 않는다.** 저장한 공고는 만료 후에도 열린다.
 *  2. **마감 알림은 끊지 않는다.** 돈을 안 낸다고 마감을 놓치게 하면 그건 해를 끼치는 것이다.
 *     저장한 공고의 마감 알림은 계속 간다.
 *  3. **빈 걸 가리고 로그인을 받지 않는다.** 맞는 공고가 0개면 게이트를 띄우지 않는다.
 *
 * 가리는 것은 "만료 뒤에 새로 올라온 공고"뿐이고, 그것도 개수와 마감일까지는 보여 준다 —
 * 가려진 게 비어 있지 않다는 증거가 있어야 블러가 통행료가 아니라 궁금증이 된다.
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
 * 이 공고의 내용을 보여 줘도 되는가.
 * 저장한 공고는 만료 후에도 보인다 — 본인이 고른 것이고, 마감을 놓치면 실제 손해가 된다.
 */
export function canSeeAnnouncement(
  input: { account: Account | null; subscription: Subscription; saved: string[] },
  announcementId: string,
  now = Date.now(),
): boolean {
  const level = accessLevel(input, now);
  if (level === "full") return true;
  return level === "expired" && input.saved.includes(announcementId);
}

/** 비용 계산은 구독 중에만. 만료 후에는 저장한 공고라도 새로 계산하지 않는다 */
export const canOpenCost = (input: { account: Account | null; subscription: Subscription }, now = Date.now()): boolean =>
  accessLevel(input, now) === "full";

/**
 * 게이트를 띄울지. 맞는 공고가 0개면 로그인을 요구하지 않는다 —
 * 비어 있는 걸 가리고 가입을 받는 건 사기다.
 */
export const shouldGate = (level: AccessLevel, matchedCount: number): boolean => level === "gate" && matchedCount > 0;
