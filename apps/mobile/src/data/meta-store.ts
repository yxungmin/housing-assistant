/**
 * 앱 메타 상태(관심·신청·구독·알림 이력·본 공고 id…) 저장소.
 *
 * 왜 SecureStore가 아닌가: SecureStore는 키체인·키스토어라 값이 2 KB를 넘으면 실패할 수 있다고 문서가 경고한다.
 * meta는 `seen` 800개 id(UUID면 30 KB)와 신고·알림 이력을 담아 훨씬 크다. 그동안은 모든 dispatch마다 통째로
 * 다시 썼고 write()가 오류를 삼켰으니, 실패해도 아무도 몰랐다 (2026-09-24 감사).
 * 민감한 것은 프로필(소득·자산)이고 그건 SecureStore에 그대로 있다. 여기 오는 값은 공고 id·설정·구독 상태다.
 *
 * 네이티브는 앱 문서 디렉터리 파일(캐시 디렉터리는 OS가 지울 수 있다), 웹은 localStorage.
 * 쓰기는 모아서 한다 — 스크롤 한 번에 noteSeen이 수십 번 오는데 그때마다 파일을 쓰면 안 된다.
 */
import { Platform } from "react-native";

const KEY = "meta.v1.json";
const isWeb = Platform.OS === "web";

async function file() {
  const fs = await import("expo-file-system");
  return new fs.File(fs.Paths.document, KEY);
}

export async function readMeta(): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(KEY) ?? null;
    const f = await file();
    return f.exists ? await f.text() : null;
  } catch {
    return null;
  }
}

let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  const text = pending;
  pending = null;
  if (text === null) return;
  try {
    if (isWeb) {
      globalThis.localStorage?.setItem(KEY, text);
      return;
    }
    const f = await file();
    f.write(text); // 없으면 만든다 (cache.ts와 같은 쓰임)
  } catch {
    // 다음 변경 때 다시 쓴다. 메타는 잃어도 다시 만들어지는 값이다 (관심 목록은 아쉽지만 앱이 멈추지는 않는다)
  }
}

/** 모아서 쓴다. 마지막 변경 뒤 delayMs 지나면 한 번 */
export function writeMeta(text: string, delayMs = 300): void {
  pending = text;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delayMs);
}

/** 테스트·종료 직전용: 기다리지 않고 바로 쓴다 */
export const flushMeta = (): Promise<void> => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return flush();
};
