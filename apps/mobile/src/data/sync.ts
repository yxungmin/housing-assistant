import { useEffect } from "react";
import { setAnnouncements, type Announcement } from "./announcements";
import { readFeedCache, writeFeedCache } from "./cache";
import { fetchRemoteAnnouncements, remoteConfigured } from "./remote";
import { detectChanges, type ChangeRecord } from "@/lib/changes";

/**
 * 앱 시작 시 공고 목록을 번들 → 캐시 → Supabase 순으로 갱신한다.
 * 원격이 없거나 실패하면 마지막으로 성공한 목록(캐시 또는 번들)으로 계속 동작한다 (오프라인 원칙).
 *
 * 갱신할 때 관심 공고의 값이 바뀌었는지 직전 목록과 대조한다. 값이 바뀌는 이유는 둘뿐이다 —
 * 우리가 신고를 받아 고쳤거나, 공고가 정정되었거나. 어느 쪽이든 사용자에게 말해야 한다.
 */
export function useAnnouncementSync(savedIds: string[] = [], onChanges?: (records: ChangeRecord[]) => void): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readFeedCache();
      if (cached && !cancelled && remoteConfigured) setAnnouncements(cached.list, "cache", cached.syncedAt);
      if (!remoteConfigured) return;
      try {
        const list = await fetchRemoteAnnouncements();
        if (cancelled) return;
        const before: Announcement[] = cached?.list ?? [];
        const syncedAt = new Date().toISOString();
        setAnnouncements(list, "remote", syncedAt);
        await writeFeedCache({ syncedAt, list });
        // 캐시가 없으면 "직전"이 없다 → 첫 동기화는 전부 새 값이라 변경으로 보지 않는다
        if (before.length > 0 && onChanges) {
          const records = detectChanges(before, list, savedIds);
          if (records.length > 0) onChanges(records);
        }
      } catch {
        /* 캐시·번들 데이터로 계속 */
      }
    })();
    return () => {
      cancelled = true;
    };
    // 목록 갱신은 앱을 열 때 한 번만 한다 (savedIds 변화로 다시 받지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
