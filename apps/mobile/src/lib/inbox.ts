/**
 * 알림 이력.
 *
 * 푸시는 한 번 뜨고 사라진다. 잠금화면에서 지웠거나 알림을 꺼 둔 사이에 지나간 것은
 * 다시 볼 방법이 없었다. 접수 마감이나 임대조건 변경처럼 놓치면 손해인 것들이라
 * 앱 안에 이력을 남긴다 — 읽었는지, 무엇이 바뀌었는지, 어느 공고였는지.
 *
 * 만드는 곳은 둘이다.
 *  - 변경 알림: `changes.ts`가 관심 공고의 값 변화를 찾을 때 (`fromChange`)
 *  - 마감·새 공고: 앱을 열 때 지금 목록을 보고 (`syncInbox`)
 * 어느 쪽이든 id가 내용에서 결정되므로(`deadline:<공고>:<마감일>`) 여러 번 돌아도 늘지 않는다.
 *
 * 90일이 지나면 버린다. 접수가 끝나고 당첨자 발표까지 지나면 그 알림은 기록일 뿐이고,
 * 무한정 쌓이면 기기 저장소를 계속 먹는다.
 */
import { isServiceRegion } from "@housing/schema";
import type { ChangeRecord } from "./changes";
import { daysUntil } from "./format";

export type NotificationKind = "deadline" | "change" | "new";

export interface AppNotification {
  /** 내용에서 정해지는 값. 같은 일로 두 번 쌓이지 않게 한다 */
  id: string;
  kind: NotificationKind;
  title: string;
  /** 한두 줄 요약. 열지 않고도 무슨 일인지 알 수 있어야 한다 */
  body: string;
  /** 누르면 갈 공고. 없으면 누를 수 없다 */
  announcementId?: string;
  /** 만든 시각 (ISO) */
  at: string;
  read: boolean;
}

/** 이 기간이 지난 알림은 버린다 */
export const RETAIN_DAYS = 90;

const DAY = 86_400_000;

export const unreadCount = (list: AppNotification[]): number => list.filter((n) => !n.read).length;

/** 새 것이 위로. 같은 시각이면 id로 갈라 순서가 흔들리지 않게 한다 */
export const sortNotifications = (list: AppNotification[]): AppNotification[] =>
  [...list].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));

/** 90일이 지난 것을 버린다. 불러올 때 한 번 지난다 */
export function pruneNotifications(list: AppNotification[], now = new Date()): AppNotification[] {
  const cutoff = now.getTime() - RETAIN_DAYS * DAY;
  return list.filter((n) => {
    const t = Date.parse(n.at);
    return Number.isNaN(t) || t >= cutoff;
  });
}

/** 이미 있는 id는 건드리지 않는다 — 읽음 표시를 되돌리지 않기 위해서다 */
export function addNotifications(list: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const have = new Set(list.map((n) => n.id));
  const fresh = incoming.filter((n) => !have.has(n.id));
  return fresh.length === 0 ? list : sortNotifications([...list, ...fresh]);
}

export const markRead = (list: AppNotification[], id: string): AppNotification[] =>
  list.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n));

export const markAllRead = (list: AppNotification[]): AppNotification[] =>
  list.every((n) => n.read) ? list : list.map((n) => (n.read ? n : { ...n, read: true }));

export const removeNotification = (list: AppNotification[], id: string): AppNotification[] => list.filter((n) => n.id !== id);

/** 관심 공고의 값이 바뀐 기록 → 알림 한 줄. changes.ts가 이미 무엇이 바뀌었는지 문장으로 만들어 둔다. */
export function fromChange(record: ChangeRecord): AppNotification {
  return {
    id: `change:${record.announcementId}:${record.at}`,
    kind: "change",
    title: `${record.title} 정보가 바뀌었어요`,
    body: record.changes.map((c) => c.text).join(" · "),
    announcementId: record.announcementId,
    at: record.at,
    read: false,
  };
}

export interface InboxSource {
  id: string;
  title: string;
  apply_end?: string;
  /** 시도 코드. 있으면 서비스 지역 밖 공고는 "새 공고" 알림에서 뺀다 */
  region_code?: string;
}

/** 마감 알림을 만들 기준. 기기 예약 알림과 같은 날수여야 이력과 실제 알림이 어긋나지 않는다 */
export const DEADLINE_DAYS = 3;

/**
 * 지금 목록을 보고 만들 알림을 고른다. 이미 있는 것은 addNotifications가 거른다.
 *
 * @param saved 관심 공고 id. 마감 알림은 관심 공고에만 만든다 — 전체 공고에 만들면 매일 수십 개가 쌓인다.
 * @param unseenIds 아직 한 번도 목록에 뜬 적 없는 공고 id (lib/unseen.ts)
 */
export function syncInbox(
  list: InboxSource[],
  saved: string[],
  unseenIds: string[],
  now = new Date(),
): AppNotification[] {
  const at = now.toISOString();
  const out: AppNotification[] = [];
  const byId = new Map(list.map((a) => [a.id, a]));

  for (const id of saved) {
    const a = byId.get(id);
    if (!a?.apply_end) continue;
    const left = daysUntil(a.apply_end, now);
    // 이미 끝난 것은 알리지 않는다. 지금 할 수 있는 일이 없는 알림은 성가심일 뿐이다.
    if (left === null || left < 0 || left > DEADLINE_DAYS) continue;
    out.push({
      // 마감일을 id에 넣는다. 공고가 정정되어 마감이 밀리면 그때 다시 알려야 한다.
      id: `deadline:${a.id}:${a.apply_end}`,
      kind: "deadline",
      title: "접수 마감이 다가와요",
      body: left === 0 ? `${a.title} 접수가 오늘 끝나요.` : `${a.title} 접수가 ${left}일 뒤에 끝나요.`,
      announcementId: a.id,
      at,
      read: false,
    });
  }

  for (const id of unseenIds) {
    const a = byId.get(id);
    if (!a) continue;
    // 서비스 지역 밖 공고(홈에서 "다른 지역 공고"로 접힌 것)는 새 공고로 알리지 않는다 —
    // 실서버 첫 동기화에서 제주·군산·양산이 "새 공고가 올라왔어요"로 7건 중 3건을 차지했다 (2026-09-24). 못 쓰는 공고 알림은 소음이다.
    if (a.region_code && !isServiceRegion(a.region_code)) continue;
    out.push({
      id: `new:${a.id}`,
      kind: "new",
      title: "새 공고가 올라왔어요",
      body: a.title,
      announcementId: a.id,
      at,
      read: false,
    });
  }

  return out;
}
