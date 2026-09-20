/**
 * 공고 목록 캐시. 네이티브는 앱 캐시 디렉터리 파일, 웹은 localStorage.
 * 프로필과 달리 공개 데이터라 암호화하지 않는다. 실패는 모두 조용히 무시한다 (번들 데이터로 동작).
 */
import { Platform } from "react-native";
import type { Announcement } from "./announcements";

export interface CachedFeed {
  syncedAt: string;
  list: Announcement[];
}

const KEY = "announcements-cache.v1.json";
const isWeb = Platform.OS === "web";

async function file() {
  const fs = await import("expo-file-system");
  return new fs.File(fs.Paths.cache, KEY);
}

export async function readFeedCache(): Promise<CachedFeed | null> {
  try {
    const text = isWeb ? globalThis.localStorage?.getItem(KEY) ?? null : await (async () => {
      const f = await file();
      return f.exists ? await f.text() : null;
    })();
    if (!text) return null;
    const parsed = JSON.parse(text) as CachedFeed;
    return Array.isArray(parsed.list) && typeof parsed.syncedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeFeedCache(feed: CachedFeed): Promise<void> {
  try {
    const text = JSON.stringify(feed);
    if (isWeb) {
      globalThis.localStorage?.setItem(KEY, text);
      return;
    }
    const f = await file();
    f.write(text);
  } catch {
    /* 캐시는 없어도 된다 */
  }
}
