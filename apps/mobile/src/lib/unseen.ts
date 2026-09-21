/**
 * "아직 안 본 공고" 표시.
 *
 * 마감이 걸린 정보라 새로 올라온 것을 놓치면 안 된다. 그런데 순진하게 "안 열어 본 것"을
 * 새 것으로 치면 앱을 처음 켠 사람에게는 목록 전체가 새 것이 된다 — 전부 새 것이면 아무것도 새 것이 아니다.
 *
 * 그래서 처음 켠 순간의 목록을 기준선으로 삼아 통째로 "이미 아는 것"으로 넣고, 아무것도 새 것으로 치지 않는다.
 * 그 뒤에 나타난 id만 새 공고이고, 상세를 열면 사라진다.
 * `changes.ts`가 "처음 보는 공고는 변경이 아니다"라고 보는 것과 같은 규칙이다.
 */

export interface SeenState {
  /** 목록에 떴던 공고 id. 처음 켤 때 그 시점 목록으로 한 번에 채운다 */
  known: string[];
  /** 기준선 이후에 나타났고 아직 상세를 열지 않은 id */
  newIds: string[];
}

export const emptySeen: SeenState = { known: [], newIds: [] };

/** 기기가 기억할 id 수 상한. 지난 공고까지 쌓이면 저장소만 먹는다 */
const MAX_KNOWN = 400;

/**
 * 지금 목록을 보고 기록을 갱신한다.
 * `fresh`는 이번에 처음 나타난 공고 — 처음 켠 경우에는 비어 있다(기준선이라서).
 * 바뀔 게 없으면 이전 객체를 그대로 돌려준다 (불필요한 저장·렌더를 막는다).
 */
export function noteSeen(prev: SeenState, ids: string[]): { next: SeenState; fresh: string[] } {
  const known = new Set(prev.known);
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length === 0) return { next: prev, fresh: [] };

  const baseline = prev.known.length === 0;
  const fresh = baseline ? [] : unknown;
  return {
    next: {
      known: [...unknown, ...prev.known].slice(0, MAX_KNOWN),
      newIds: [...fresh, ...prev.newIds].slice(0, MAX_KNOWN),
    },
    fresh,
  };
}

/** 상세를 연 공고는 더 이상 새 것이 아니다 */
export function markOpened(prev: SeenState, id: string): SeenState {
  if (!prev.newIds.includes(id)) return prev;
  return { ...prev, newIds: prev.newIds.filter((x) => x !== id) };
}

/** 목록 카드에 "새 공고"를 붙일지 */
export const isUnseen = (seen: SeenState, id: string): boolean => seen.newIds.includes(id);

/** 목록 전체에서 안 본 것의 수 (목록 머리말에 쓴다) */
export const unseenCount = (seen: SeenState, ids: string[]): number => ids.filter((id) => isUnseen(seen, id)).length;

/** 아직 안 연 새 공고 id만. 알림 이력이 "새 공고" 줄을 만들 때 쓴다 (lib/inbox.ts) */
export const unseenIds = (seen: SeenState, ids: string[]): string[] => ids.filter((id) => isUnseen(seen, id));
