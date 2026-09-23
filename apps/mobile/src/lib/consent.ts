import { TERMS_VERSION } from "@/legal/terms";

/**
 * 이용약관 동의.
 *
 * 무엇을 받고 무엇을 받지 않는가:
 *  - **이용약관 — 동의(필수).** 보여 주고 동의를 받아야 계약 내용이 된다.
 *  - **만 14세 이상 — 확인(필수).** 14세 미만의 개인정보는 법정대리인 동의가 따로 필요하다.
 *  - **개인정보 — 동의가 아니라 알림.** 계정 id·이메일·구독 상태는 계약 이행에 필요한 정보라
 *    동의 없이 처리하고 처리방침으로 알린다(개인정보 보호법 제15조 제1항 제4호).
 *    이걸 "필수 동의"로 묶는 관행은 개인정보위가 고치라고 한 것이다.
 *  - "전체 동의"는 두지 않는다. 필수 둘뿐이라 필요 없고, 나중에 선택 항목(마케팅 알림 등)이
 *    생기면 전체 동의가 선택 동의까지 한 번에 눌러 버린다.
 *
 * 받는 자리는 로그인이다. 계정이 생기는 순간이 계약이 시작되는 순간이다.
 * 동의는 계정에 붙는다(Account.consent) — 로그아웃하면 같이 사라지고, 다른 계정은 따로 동의한다.
 */
export interface TermsConsent {
  termsVersion: string;
  /** 기기 시각. 서버 기록(terms_consents.agreed_at)은 서버가 따로 적는다 */
  agreedAt: string;
  /** 서버에 기록했는가. 실패하면 다음 실행 때 다시 보낸다 */
  sent?: boolean;
}

export const newConsent = (now = new Date()): TermsConsent => ({ termsVersion: TERMS_VERSION, agreedAt: now.toISOString() });

/** 로그인했는데 지금 판에 동의한 기록이 없는가. 약관이 바뀌었거나, 이 기능 전에 만든 계정이다 */
export const needsTermsConsent = (account: { consent?: TermsConsent } | null): boolean =>
  !!account && account.consent?.termsVersion !== TERMS_VERSION;

/** 서버로 보낼 것이 남았는가 */
export const consentToSend = (account: { consent?: TermsConsent } | null): TermsConsent | null =>
  account?.consent && !account.consent.sent && account.consent.termsVersion === TERMS_VERSION ? account.consent : null;

export type LegalKey = "terms" | "privacy";

/** 로그인 화면의 필수 확인 둘 */
export interface ConsentValue {
  age: boolean;
  terms: boolean;
}
export const consentReady = (v: ConsentValue): boolean => v.age && v.terms;
