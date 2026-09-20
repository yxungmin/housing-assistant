import { useEffect } from "react";
import { setAnnouncements } from "./announcements";
import { readFeedCache, writeFeedCache } from "./cache";
import { fetchRemoteAnnouncements, remoteConfigured } from "./remote";

/**
 * 앱 시작 시 공고 목록을 번들 → 캐시 → Supabase 순으로 갱신한다.
 * 원격이 없거나 실패하면 마지막으로 성공한 목록(캐시 또는 번들)으로 계속 동작한다 (오프라인 원칙).
 */
export function useAnnouncementSync(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readFeedCache();
      if (cached && !cancelled && remoteConfigured) setAnnouncements(cached.list, "cache", cached.syncedAt);
      if (!remoteConfigured) return;
      try {
        const list = await fetchRemoteAnnouncements();
        if (cancelled) return;
        const syncedAt = new Date().toISOString();
        setAnnouncements(list, "remote", syncedAt);
        await writeFeedCache({ syncedAt, list });
      } catch {
        /* 캐시·번들 데이터로 계속 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
