/**
 * Supabase Auth 붙이기 (PKCE). supabase-js를 넣지 않고 fetch로 직접 부른다 —
 * 이 앱은 읽기도 `data/remote.ts`에서 그렇게 하고 있고, 인증 하나 때문에 번들에
 * 라이브러리를 더 얹을 이유가 없다.
 *
 * 흐름:
 *   1. verifier를 만들어 보관하고, 그 해시(challenge)를 authorize URL에 실어 브라우저를 연다
 *   2. 제공자 로그인이 끝나면 `<scheme>://auth?code=…`로 앱에 돌아온다
 *   3. code + verifier를 토큰으로 바꾼다 (verifier가 없는 쪽은 code를 주워도 못 바꾼다)
 *
 * 토큰은 SecureStore에 둔다 (iOS Keychain / Android Keystore). AsyncStorage는 평문이다.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  authorizeUrl,
  base64url,
  CANCELLED,
  needsRefresh,
  parseRedirect,
  toSession,
  VERIFIER_BYTES,
  type AuthProvider,
  type AuthSession,
} from "@/lib/auth";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** 서버 설정이 없으면 로그인 버튼을 눌러도 아무 일이 없어야 한다 — 호출부가 이걸 먼저 본다 */
export const authConfigured = !!URL && !!KEY;

const SESSION_KEY = "auth.session";
/** 브라우저에 다녀오는 동안 verifier를 들고 있어야 한다. 앱이 죽었다 살아나도 남아야 하므로 저장한다 */
const VERIFIER_KEY = "auth.verifier";

const headers = () => ({ apikey: KEY!, "Content-Type": "application/json" });

/** 리디렉트로 돌아올 주소. app.json의 scheme을 그대로 쓴다 */
export const redirectUri = () => Linking.createURL("auth");

async function makeVerifier(): Promise<string> {
  return base64url(await Crypto.getRandomBytesAsync(VERIFIER_BYTES));
}

async function challengeFor(verifier: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return base64url(bytes);
}

export async function loadSession(): Promise<AuthSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

async function saveSession(s: AuthSession | null): Promise<void> {
  try {
    if (s) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // 키체인이 막혀 있어도 이번 세션은 메모리로 굴러간다. 다음 실행에 다시 로그인하면 된다
  }
}

/**
 * Apple은 브라우저를 열지 않는다.
 *
 * iOS에는 시스템이 제공하는 로그인 시트가 있다 — Face ID로 끝나고 앱을 떠나지 않는다.
 * 웹 OAuth로도 붙일 수는 있지만, "Apple로 로그인"을 눌렀는데 사파리가 뜨는 것은
 * 아이폰 사용자가 아는 그 동작이 아니다. 그리고 그 경우 Services ID를 따로 만들어야 하는데
 * 네이티브 방식은 App ID(번들 id)만 Supabase에 등록하면 된다.
 *
 * 받은 id_token을 Supabase가 Apple의 공개키로 검증해 세션을 만든다 (grant_type=id_token).
 * 그래서 우리 서버에 Apple 비밀키를 둘 필요가 없다.
 *
 * 이름은 **첫 로그인에만** 온다. 그 뒤로는 Apple이 주지 않으므로, 필요하면 그때 저장해야 한다.
 * 지금은 저장하지 않는다 — 계정에 담는 것은 구독 상태뿐이라는 선을 지킨다.
 */
async function signInWithAppleNative(): Promise<AuthSession> {
  if (!(await AppleAuthentication.isAvailableAsync())) throw new Error("이 기기에서는 Apple 로그인을 쓸 수 없어요");
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    // 사용자가 시트를 닫은 것은 실패가 아니다
    if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") throw new Error(CANCELLED, { cause: e });
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple이 토큰을 주지 않았어요");

  const res = await fetch(`${URL}/auth/v1/token?grant_type=id_token`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ provider: "apple", id_token: credential.identityToken }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const b = body as { error_description?: string; msg?: string } | null;
    throw new Error(b?.error_description ?? b?.msg ?? `HTTP ${res.status}`);
  }
  const session = toSession(body, "apple");
  if (!session) throw new Error("로그인 응답에 토큰이 없어요");
  await saveSession(session);
  return session;
}

/** 제공자 로그인. 사용자가 창을 닫으면 CANCELLED를 던진다 (실패로 세지 않는다) */
export async function signInWith(provider: AuthProvider): Promise<AuthSession> {
  if (!authConfigured) throw new Error("Supabase 미설정");
  if (provider === "apple" && Platform.OS === "ios") return signInWithAppleNative();
  const verifier = await makeVerifier();
  await SecureStore.setItemAsync(VERIFIER_KEY, verifier);
  const redirect = redirectUri();
  const url = authorizeUrl(URL!, provider, redirect, await challengeFor(verifier));

  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  if (result.type !== "success") throw new Error(CANCELLED);

  const parsed = parseRedirect(result.url);
  if (!parsed) throw new Error("로그인 응답을 읽지 못했어요");
  if ("error" in parsed) throw new Error(parsed.error);

  const stored = (await SecureStore.getItemAsync(VERIFIER_KEY)) ?? verifier;
  await SecureStore.deleteItemAsync(VERIFIER_KEY);

  const res = await fetch(`${URL}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ auth_code: parsed.code, code_verifier: stored }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error_description?: string; msg?: string })?.error_description ?? (body as { msg?: string })?.msg ?? `HTTP ${res.status}`);

  const session = toSession(body, provider);
  if (!session) throw new Error("로그인 응답에 토큰이 없어요");
  await saveSession(session);
  return session;
}

/** 만료가 가까우면 갱신한다. 갱신이 실패하면 세션을 지운다 — 죽은 토큰을 들고 있으면 조용히 401만 난다 */
export async function refreshIfNeeded(session: AuthSession, now = Date.now()): Promise<AuthSession | null> {
  if (!needsRefresh(session, now)) return session;
  if (!authConfigured) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = toSession(await res.json(), session.provider, now);
    if (!next) throw new Error("갱신 응답에 토큰이 없어요");
    await saveSession(next);
    return next;
  } catch {
    await saveSession(null);
    return null;
  }
}

/** 로그아웃. 서버 호출이 실패해도 기기에서는 지운다 — 사용자가 누른 건 "내 기기에서 나가기"다 */
export async function signOutRemote(session: AuthSession | null): Promise<void> {
  if (session && authConfigured) {
    try {
      await fetch(`${URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { ...headers(), Authorization: `Bearer ${session.accessToken}` },
      });
    } catch {
      // 네트워크가 없어도 아래에서 지운다
    }
  }
  await saveSession(null);
}

/**
 * 계정 삭제. 서버에서 사용자를 지우고 기기의 토큰도 지운다.
 *
 * 지울 대상은 함수가 토큰에서 정한다 — 앱이 user id를 보내지 않는다.
 * 실패하면 던진다. 조용히 로그아웃만 시키면 사용자는 지워진 줄 알고 떠나는데
 * 계정은 서버에 그대로 남는다. 되돌릴 수 없는 일에서 제일 나쁜 결말이다.
 */
/**
 * 약관 동의를 계정에 기록한다 (terms_consents). 같은 판을 두 번 보내도 한 줄만 남는다.
 * 시각은 서버가 적는다 — 넣을 수 있는 칸이 id·판·나이 확인 셋뿐이다(0015).
 */
export async function recordConsentRemote(session: AuthSession, termsVersion: string): Promise<void> {
  if (!authConfigured) return;
  const res = await fetch(`${URL}/rest/v1/terms_consents?on_conflict=user_id,terms_version`, {
    method: "POST",
    headers: { ...headers(), Authorization: `Bearer ${session.accessToken}`, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: session.userId, terms_version: termsVersion, age_confirmed: true }),
  });
  if (!res.ok) throw new Error(`동의를 기록하지 못했어요 (${res.status})`);
}

export async function deleteAccountRemote(session: AuthSession): Promise<void> {
  if (!authConfigured) throw new Error("서버 설정이 없어요");
  const res = await fetch(`${URL}/functions/v1/delete-account`, {
    method: "POST",
    headers: { ...headers(), Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `삭제하지 못했어요 (${res.status})`);
  }
  await saveSession(null);
}
