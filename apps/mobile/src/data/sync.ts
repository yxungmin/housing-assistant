import { useEffect, useRef } from "react";
import { currentAnnouncements, setAnnouncements, type Announcement } from "./announcements";
import { readFeedCache, writeFeedCache } from "./cache";
import { feedVersionKey, fetchFeedVersion, fetchRemoteAnnouncements, remoteConfigured, type FeedVersion } from "./remote";
import { detectChanges, type ChangeRecord } from "@/lib/changes";

/**
 * 앱 시작 시 공고 목록을 번들 → 캐시 → Supabase 순으로 갱신한다.
 * 원격이 없거나 실패하면 마지막으로 성공한 목록(캐시 또는 번들)으로 계속 동작한다 (오프라인 원칙).
 *
 * 갱신할 때 관심 공고의 값이 바뀌었는지 직전 목록과 대조한다. 값이 바뀌는 이유는 둘뿐이다 —
 * 우리가 신고를 받아 고쳤거나, 공고가 정정되었거나. 어느 쪽이든 사용자에게 말해야 한다.
 */
/**
 * 서버에서 한 번 받아 반영한다. 앱을 열 때와 사용자가 당겨서 새로고침할 때가 같은 일이다.
 * 실패하면 조용히 돌아간다 — 캐시·번들 데이터로 화면은 그대로 돌고, 사용자가 할 수 있는 일이 없다.
 */
/** 지금 가진 목록의 판 — 서버 것과 같으면 다시 받지 않는다 (units 수백 채가 들어 있어 전체는 수백 KB다) */
function localVersion(list: Announcement[]): FeedVersion {
  const dates = list.map((a) => a.updated_at).filter((d): d is string => !!d);
  return { count: list.length, latest: dates.length ? dates.sort().at(-1)! : null };
}

export async function syncAnnouncementsOnce(savedIds: string[], onChanges?: (records: ChangeRecord[]) => void): Promise<boolean> {
  if (!remoteConfigured) return false;
  try {
    const before = currentAnnouncements();
    // 서버 목록이 그대로면 전체를 받지 않는다. 번들 목록에는 updated_at이 없어 첫 동기화는 늘 받는다.
    if (before.some((a) => a.updated_at) && feedVersionKey(await fetchFeedVersion()) === feedVersionKey(localVersion(before))) return true;
    const list = await fetchRemoteAnnouncements();
    const syncedAt = new Date().toISOString();
    setAnnouncements(list, "remote", syncedAt);
    await writeFeedCache({ syncedAt, list });
    // 직전 목록이 없으면 "바뀐 것"을 셀 수 없다 (첫 동기화는 전부 새 값이다)
    if (before.length > 0 && onChanges) {
      const records = detectChanges(before, list, savedIds);
      if (records.length > 0) onChanges(records);
    }
    return true;
  } catch {
    return false;
  }
}

export function useAnnouncementSync(ready: boolean, savedIds: string[], onChanges?: (records: ChangeRecord[]) => void): void {
  // 관심 목록은 SecureStore에서 불러온 뒤에야 정확하다. 마운트 즉시 돌면 빈 배열이라 변경을 못 찾는다.
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    let cancelled = false;
    (async () => {
      const cached = await readFeedCache();
      if (cached && !cancelled && remoteConfigured) setAnnouncements(cached.list, "cache", cached.syncedAt);
      if (!remoteConfigured) return;
      try {
        if (cached?.list.some((a) => a.updated_at) && feedVersionKey(await fetchFeedVersion()) === feedVersionKey(localVersion(cached.list))) return;
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
    // 앱을 열 때 한 번만 받는다. savedIds가 바뀌어도 다시 받지 않는다 (done 플래그).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
