import { describe, expect, it } from "vitest";
import { TERMS, TERMS_VERSION } from "../src/legal/terms";
import { consentReady, consentToSend, needsTermsConsent, newConsent } from "../src/lib/consent";

const account = (consent?: ReturnType<typeof newConsent>) => ({ consent });

describe("약관 동의", () => {
  it("로그인 안 한 사람에게는 묻지 않는다 — 동의는 계정이 생길 때 받는다", () => {
    expect(needsTermsConsent(null)).toBe(false);
  });

  it("지금 판에 동의했으면 다시 묻지 않는다", () => {
    expect(needsTermsConsent(account(newConsent()))).toBe(false);
  });

  it("약관 판이 올라가면 다시 묻는다", () => {
    expect(needsTermsConsent(account({ termsVersion: "2000-01-01", agreedAt: "2000-01-01T00:00:00Z" }))).toBe(true);
  });

  it("동의 기록이 없는 계정(이 기능 전에 만든 계정)에도 묻는다", () => {
    expect(needsTermsConsent(account())).toBe(true);
  });

  it("보내지 않은 지금 판의 동의만 서버로 보낸다", () => {
    const c = newConsent();
    expect(consentToSend(account(c))).toEqual(c);
    expect(consentToSend(account({ ...c, sent: true }))).toBeNull();
    expect(consentToSend(account({ ...c, termsVersion: "2000-01-01" }))).toBeNull();
    expect(consentToSend(null)).toBeNull();
  });

  it("두 가지를 다 확인해야 로그인할 수 있다", () => {
    expect(consentReady({ age: true, terms: true })).toBe(true);
    expect(consentReady({ age: true, terms: false })).toBe(false);
    expect(consentReady({ age: false, terms: true })).toBe(false);
  });

  it("약관에 동의·14세 확인·변경 절차가 화면과 같은 말로 적혀 있다", () => {
    const text = TERMS.sections.flatMap((s) => s.body).join("\n");
    expect(text).toContain("만 14세 이상");
    expect(TERMS.sections.some((s) => s.heading.includes("약관의 변경"))).toBe(true);
    expect(text).toContain("다시 동의");
  });
});

/**
 * 본문을 바꾸면 TERMS_VERSION을 올려야 한다. 올리면 모든 계정에 다시 동의를 받는다.
 * 이 테스트가 깨지면 둘 중 하나를 한다:
 *  - 뜻이 바뀌었다 → TERMS_VERSION을 올리고 아래 두 값을 새로 적는다
 *  - 오탈자만 고쳤다 → 지문만 새로 적는다 (다시 동의받을 일이 아니다)
 * 어느 쪽이든 사람이 정하게 하는 것이 목적이다. 잊고 넘어가면 바뀐 약관이 계약 내용이 되지 않는다.
 */
describe("약관 판", () => {
  const fingerprint = (value: unknown) => {
    let h = 2166136261;
    for (const ch of JSON.stringify(value)) {
      h ^= ch.codePointAt(0)!;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16);
  };

  it("본문 지문과 판이 함께 고정돼 있다", () => {
    expect({ version: TERMS_VERSION, fingerprint: fingerprint(TERMS.sections) }).toEqual({ version: "2026-09-24", fingerprint: "53dc48f4" });
  });
});
