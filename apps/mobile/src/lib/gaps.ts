import type { UserProfile } from "@housing/schema";
import type { AnnouncementMatch, TrackResult } from "@housing/engine";
import { missingStepFor } from "./conditions";

/**
 * 빈칸 하나를 채우면 몇 개 공고가 더 판별되는가.
 *
 * "정보를 더 넣어 주세요"는 잘 안 먹힌다. 무엇을 얻는지 말하지 않아서다.
 * 게다가 빈칸마다 효과가 크게 다르다 — 필수 7개만 넣은 사람을 지금 공고 7건에 돌렸더니
 * 자동차 가액 하나가 6건의 판별을 막고 있었고, 청약통장·자녀·계층은 각 1건이었다 (2026-09-24).
 * 그래서 전부를 권하지 않고, 가장 많이 푸는 하나만 숫자와 함께 권한다.
 *
 * 세는 기준은 화면이 보여 주는 트랙(최선 트랙)이다. 카드의 "확인 N"과 같은 것을 세야
 * 권한 대로 채웠을 때 사람이 그 숫자가 줄어드는 것을 볼 수 있다.
 *
 * 이미 다른 조건에서 안 맞는 공고는 세지 않는다. 최선 트랙이 없다는 것은 어느 트랙이든 어긋난 조건이
 * 있다는 뜻이고, 거기서 조건 하나를 더 판별해도 결과는 그대로 "안 맞음"이다. 실제로 영구임대(수급자 전용)
 * 공고가 자동차 가액 빈칸으로 세어져 "공고 4개"가 됐는데, 넣어도 달라지는 것은 3개뿐이었다.
 */
export interface Gap {
  /** 채울 단계 id (/onboarding?step=) */
  stepId: string;
  /** 이 빈칸 때문에 판별이 막힌 공고 수 */
  announcements: number;
}

interface Row {
  announcement: { id: string };
  match: AnnouncementMatch | null;
}

/** 채우면 결과가 달라질 수 있는 트랙. 어긋난 조건이 없는 최선 트랙만 해당한다 */
const shownTrack = (m: AnnouncementMatch): TrackResult | undefined => m.best_track ?? undefined;

/**
 * 빈칸별로 막힌 공고 수를 센다. 한 공고에서 같은 빈칸이 여러 조건을 막아도 공고는 한 번만 센다 —
 * 사람이 얻는 것은 "공고 N개"이지 "조건 N개"가 아니다.
 *
 * 다른 지역이라 판단을 미룬 공고(region_uncertain)는 세지 않는다. 자동차 가액을 넣어도
 * 제주 공고가 서울 사람에게 맞게 되지는 않는다 — 넣어도 안 바뀌는 것을 약속하면 안 된다.
 */
export function gapsFor(rows: Row[], profile: UserProfile | null): Gap[] {
  if (!profile) return [];
  const blocked = new Map<string, Set<string>>();
  for (const r of rows) {
    const m = r.match;
    if (!m || m.region_uncertain) continue;
    const track = shownTrack(m);
    if (!track) continue;
    for (const g of track.groups) {
      for (const rule of g.rules) {
        if (rule.skipped || rule.status !== "NEEDS_CHECK") continue;
        const step = missingStepFor(rule.rule, profile);
        if (!step) continue;
        if (!blocked.has(step)) blocked.set(step, new Set());
        blocked.get(step)!.add(r.announcement.id);
      }
    }
  }
  return [...blocked.entries()]
    .map(([stepId, ids]) => ({ stepId, announcements: ids.size }))
    .sort((a, b) => b.announcements - a.announcements || a.stepId.localeCompare(b.stepId));
}

/**
 * 홈에 권할 하나. 공고 하나만 푸는 빈칸은 권하지 않는다 — 그 정도면 그 공고의 조건 줄에서
 * "지금 입력하기"로 충분하고, 홈에 늘 떠 있으면 잔소리가 된다.
 */
export const MIN_GAP_TO_SUGGEST = 2;

export function topGap(rows: Row[], profile: UserProfile | null): Gap | null {
  const first = gapsFor(rows, profile)[0];
  return first && first.announcements >= MIN_GAP_TO_SUGGEST ? first : null;
}
