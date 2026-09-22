import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  base64url,
  CANCELLED,
  isValidVerifier,
  needsRefresh,
  parseRedirect,
  PROVIDER_LABEL,
  shownProviders,
  signInErrorText,
  toSession,
  type AuthSession,
} from "../src/lib/auth";

const session = (over: Partial<AuthSession> = {}): AuthSession => ({
  userId: "u1",
  provider: "kakao",
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  ...over,
});

describe("토큰 응답 읽기", () => {
  const now = Date.parse("2026-09-22T00:00:00Z");
  const raw = { access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: "u1", email: "a@b.kr" } };

  it("만료 시각을 expires_in으로 계산한다", () => {
    expect(toSession(raw, "kakao", now)?.expiresAt).toBe("2026-09-22T01:00:00.000Z");
  });

  it("반쪽 응답은 세션으로 만들지 않는다 — 조용히 로그인된 척하면 안 된다", () => {
    expect(toSession({ ...raw, access_token: undefined }, "kakao", now)).toBeNull();
    expect(toSession({ ...raw, refresh_token: undefined }, "kakao", now)).toBeNull();
    expect(toSession({ ...raw, user: {} }, "kakao", now)).toBeNull();
    expect(toSession(null, "kakao", now)).toBeNull();
  });

  it("이메일이 없어도 세션은 성립한다 — 카카오는 Biz App 전까지 이메일을 안 준다", () => {
    const s = toSession({ ...raw, user: { id: "u1" } }, "kakao", now);
    expect(s?.userId).toBe("u1");
    expect(s?.email).toBeUndefined();
  });
});

describe("갱신 시점", () => {
  it("만료 직전이면 미리 갱신한다 — 딱 맞추면 요청 중에 만료된다", () => {
    const now = Date.now();
    expect(needsRefresh(session({ expiresAt: new Date(now + 30_000).toISOString() }), now)).toBe(true);
    expect(needsRefresh(session({ expiresAt: new Date(now + 600_000).toISOString() }), now)).toBe(false);
  });
});

describe("authorize 주소", () => {
  it("PKCE challenge와 돌아올 주소를 싣는다", () => {
    const url = new URL(authorizeUrl("https://x.supabase.co/", "kakao", "housingassistant://auth", "CH"));
    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("kakao");
    expect(url.searchParams.get("redirect_to")).toBe("housingassistant://auth");
    expect(url.searchParams.get("code_challenge")).toBe("CH");
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  });
});

describe("돌아온 리디렉트 읽기", () => {
  it("코드를 꺼낸다", () => {
    expect(parseRedirect("housingassistant://auth?code=abc123")).toEqual({ code: "abc123" });
  });

  it("실패는 쿼리에도 프래그먼트에도 온다 — 제공자마다 다르다", () => {
    expect(parseRedirect("housingassistant://auth?error=access_denied")).toEqual({ error: "access_denied" });
    expect(parseRedirect("housingassistant://auth#error=server_error")).toEqual({ error: "server_error" });
  });

  it("설명이 있으면 설명을 쓴다", () => {
    expect(parseRedirect("housingassistant://auth?error=x&error_description=provider+is+not+enabled")).toEqual({
      error: "provider is not enabled",
    });
  });

  it("코드도 오류도 없으면 null", () => {
    expect(parseRedirect("housingassistant://auth")).toBeNull();
  });

  it("프래그먼트가 붙어 있어도 쿼리의 코드를 잘라 읽는다", () => {
    expect(parseRedirect("housingassistant://auth?code=abc#foo=1")).toEqual({ code: "abc" });
  });
});

describe("실패 문구", () => {
  it("사용자가 창을 닫은 건 실패가 아니다 — 아무 말도 하지 않는다", () => {
    expect(signInErrorText(new Error(CANCELLED))).toBeNull();
    expect(signInErrorText(new Error("access_denied"))).toBeNull();
  });

  it("제공자가 꺼져 있으면 다른 방법을 안내한다", () => {
    expect(signInErrorText(new Error("provider is not enabled"))).toContain("다른 방법");
  });

  it("영어 원문을 그대로 띄우지 않는다", () => {
    const text = signInErrorText(new Error("Bad Request: invalid grant"));
    expect(text).not.toMatch(/[A-Za-z]{4}/);
  });
});

describe("PKCE verifier", () => {
  it("RFC 7636 길이·문자 규칙을 지킨다", () => {
    expect(isValidVerifier("a".repeat(43))).toBe(true);
    expect(isValidVerifier("a".repeat(42))).toBe(false);
    expect(isValidVerifier("a".repeat(129))).toBe(false);
    expect(isValidVerifier(`${"a".repeat(42)}+`)).toBe(false);
  });
});

describe("base64url", () => {
  const enc = (s: string) => base64url(new TextEncoder().encode(s));

  it("표준 base64url과 같다 — 길이 나머지 0·1·2를 모두 본다", () => {
    expect(enc("")).toBe("");
    expect(enc("f")).toBe("Zg");
    expect(enc("fo")).toBe("Zm8");
    expect(enc("foo")).toBe("Zm9v");
    expect(enc("foob")).toBe("Zm9vYg");
    expect(enc("fooba")).toBe("Zm9vYmE");
    expect(enc("foobar")).toBe("Zm9vYmFy");
  });

  it("URL에 못 쓰는 +/= 가 나오지 않는다", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(base64url(bytes)).not.toMatch(/[+/=]/);
  });

  it("32바이트를 넣으면 verifier 규칙(43자)을 만족한다", () => {
    const v = base64url(new Uint8Array(32).map((_, i) => (i * 7 + 3) % 256));
    expect(v).toHaveLength(43);
    expect(isValidVerifier(v)).toBe(true);
  });
});

/**
 * App Store 4.8: 제3자 로그인을 쓰면 **동등한** 수단을 함께 제공해야 한다.
 * 이 조항은 조용히 깨진다 — 제공자 하나를 추가하면서 Apple을 빼먹어도 앱은 잘 돌고,
 * 심사에서야 알게 된다. 그래서 규칙 자체를 고정한다.
 */
describe("로그인 화면에 띄우는 제공자", () => {
  it("iOS에 제3자 로그인이 있으면 Apple이 반드시 같이 있다 (4.8)", () => {
    const ios = shownProviders("ios");
    const thirdParty = ios.filter((p) => p !== "apple");
    if (thirdParty.length > 0) expect(ios).toContain("apple");
  });

  it("안드로이드는 Apple을 띄우지 않는다 — 거기선 의무가 아니고 쓸 수도 없다", () => {
    expect(shownProviders("android")).not.toContain("apple");
  });

  it("빈 목록을 내지 않는다 — 로그인할 방법이 없으면 앱을 쓸 수 없다", () => {
    for (const p of ["ios", "android", "web"]) expect(shownProviders(p).length).toBeGreaterThan(0);
  });

  it("카카오는 지금 빠져 있다 — 비즈 앱 전환 전에는 KOE205로 거절당한다", () => {
    for (const p of ["ios", "android"]) expect(shownProviders(p)).not.toContain("kakao");
  });

  it("띄우는 제공자는 모두 이름을 갖고 있다 — 없으면 버튼에 원시 id가 나온다", () => {
    for (const p of [...shownProviders("ios"), ...shownProviders("android")]) {
      expect(PROVIDER_LABEL[p]).toBeTruthy();
    }
  });
});
