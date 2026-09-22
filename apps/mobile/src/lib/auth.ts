/**
 * 로그인 — 순수 규칙만. 네트워크·브라우저·네이티브는 `data/auth.ts`가 한다.
 *
 * 왜 Supabase Auth인가: 서버가 이미 Supabase다. 인증을 여기 두면 `auth.uid()`로 RLS를
 * 그대로 쓸 수 있고, 구독을 계정에 묶을 자리가 생긴다 (기기를 바꿔도 구독이 따라온다).
 *
 * 왜 PKCE인가: 네이티브 앱은 리디렉트 URL을 다른 앱이 가로챌 수 있다. implicit 흐름은
 * 그 URL에 토큰을 그대로 실어 보내므로, 가로채는 쪽이 곧 로그인된다. PKCE는 토큰 대신
 * 일회용 코드를 싣고, 그 코드는 이 앱만 아는 verifier가 있어야 토큰으로 바뀐다.
 *
 * **프로필(소득·자산)은 로그인해도 서버로 가지 않는다.** 계정이 들고 있는 것은 구독 상태뿐이다.
 * 이 선을 여기 적어 둔다 — "로그인했으니 동기화하자"로 넘어가기 가장 쉬운 자리다.
 */

/** 화면에 쓰는 이름. 4.8 때문에 apple은 iOS에서 반드시 같이 보여야 한다 */
export type AuthProvider = "kakao" | "apple" | "google";

export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  kakao: "카카오",
  apple: "Apple",
  google: "구글",
};

/**
 * 로그인 화면에 띄울 제공자.
 *
 * **카카오는 지금 없다** (2026-09-22). 코드가 아니라 계정 문제다 — Supabase가 카카오 scope에
 * `account_email`을 기본으로 넣는데 그 동의항목은 비즈 앱(사업자등록번호)이라야 켤 수 있어,
 * 누르면 카카오가 KOE205로 거절한다. `scopes`로 빼려 해도 그건 더하기만 된다(실측).
 * 비즈 앱이 되면 "kakao"를 맨 앞에 다시 넣으면 끝이다 — 나머지 코드는 제공자에 무관하다.
 *
 * iOS에 Apple이 있는 것은 App Store 4.8 때문이다. 제3자 로그인을 쓰면 **동등한** 수단을
 * 반드시 함께 제공해야 한다. 그래서 iOS에 제3자가 하나라도 있으면 apple이 같이 있어야 한다.
 */
export function shownProviders(platform: string): AuthProvider[] {
  return platform === "ios" ? ["apple", "google"] : ["google"];
}

export interface AuthSession {
  userId: string;
  provider: AuthProvider;
  accessToken: string;
  refreshToken: string;
  /** ISO. access token이 만료되는 시각 */
  expiresAt: string;
  /** 카카오는 Biz App 등록 전에는 이메일을 주지 않는다. 없을 수 있다 */
  email?: string;
}

/** 만료 이 초 전이면 미리 갱신한다 — 딱 맞춰 쓰면 요청 중에 만료된다 */
export const REFRESH_SKEW_SEC = 60;

export function needsRefresh(session: AuthSession, now = Date.now()): boolean {
  return Date.parse(session.expiresAt) - REFRESH_SKEW_SEC * 1000 <= now;
}

/** Supabase 토큰 응답 → 우리 세션. 형태가 안 맞으면 null (조용히 반쪽 세션을 만들지 않는다) */
export function toSession(raw: unknown, provider: AuthProvider, now = Date.now()): AuthSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const user = r.user as Record<string, unknown> | undefined;
  const userId = typeof user?.id === "string" ? user.id : undefined;
  if (typeof r.access_token !== "string" || typeof r.refresh_token !== "string" || !userId) return null;
  const expiresIn = typeof r.expires_in === "number" ? r.expires_in : 3600;
  const email = typeof user?.email === "string" && user.email ? user.email : undefined;
  return {
    userId,
    provider,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: new Date(now + expiresIn * 1000).toISOString(),
    ...(email ? { email } : {}),
  };
}

/**
 * OAuth를 시작할 주소.
 * `skip_http_redirect`는 쓰지 않는다 — 기기 브라우저가 실제로 제공자 화면까지 따라가야 한다.
 */
export function authorizeUrl(baseUrl: string, provider: AuthProvider, redirectTo: string, challenge: string): string {
  const q = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: "s256",
  });
  return `${baseUrl.replace(/\/$/, "")}/auth/v1/authorize?${q.toString()}`;
}

/**
 * 돌아온 리디렉트에서 인가 코드를 꺼낸다.
 *
 * 성공은 `?code=…`다. 실패는 두 자리로 온다 — 쿼리(`?error=…`)와 프래그먼트(`#error=…`).
 * 제공자마다 다르므로 둘 다 본다. 사용자가 그냥 닫은 경우도 여기로 온다.
 */
export function parseRedirect(url: string): { code: string } | { error: string } | null {
  const qIndex = url.indexOf("?");
  const hIndex = url.indexOf("#");
  const params = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1, hIndex > qIndex ? hIndex : undefined) : "");
  const frag = new URLSearchParams(hIndex >= 0 ? url.slice(hIndex + 1) : "");
  const code = params.get("code");
  if (code) return { code };
  const error =
    params.get("error_description") ?? params.get("error") ?? frag.get("error_description") ?? frag.get("error");
  return error ? { error } : null;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * base64url. `btoa`를 쓰지 않는다 — Hermes에 있다는 보장이 없고, 없으면 로그인 첫 줄에서
 * 터진다. 테스트는 node에서 도니 `btoa`가 있어 그 실패를 잡아 주지도 못한다.
 * 패딩(`=`)은 붙이지 않는다. RFC 7636의 verifier·challenge는 패딩 없는 형태다.
 */
export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64URL[a >> 2]! + B64URL[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b === undefined) break;
    out += B64URL[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c === undefined) break;
    out += B64URL[c & 63]!;
  }
  return out;
}

/** RFC 7636: verifier는 43~128자. 32바이트를 base64url하면 43자가 된다 */
export const VERIFIER_BYTES = 32;

export function isValidVerifier(v: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
}

/**
 * 로그인 실패를 사람 말로. 원문은 영어로 오고, 그대로 띄우면 사용자가 할 수 있는 게 없다.
 * 사용자가 창을 닫은 건 실패가 아니므로 null (아무 말도 하지 않는다).
 */
export function signInErrorText(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg === CANCELLED) return null;
  if (/access_denied|cancel/i.test(msg)) return null;
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return "지금은 이 방법으로 로그인할 수 없어요. 다른 방법을 써 주세요.";
  if (/network|fetch|timeout/i.test(msg)) return "연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요.";
  return "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

/** 사용자가 로그인 창을 닫았다. 실패로 세지 않는다 */
export const CANCELLED = "cancelled";
