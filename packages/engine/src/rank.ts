/**
 * 예상 순위.
 *
 * 자격(되느냐)과 순위(되면 몇 번째냐)는 다른 질문이다. 국민임대·행복주택은 순위제라, 자격이 돼도
 * 1순위에서 모집이 차면 2순위는 차례가 오지 않는다. 지난 회차 결과("1순위에서 마감")는 내 순위를
 * 알아야 읽을 수 있는 값이라, 그 짝을 여기서 만든다.
 *
 * 규칙은 공고문 그대로다: 순위를 1부터 차례로 보고, 조건이 모두 맞는 첫 순위가 내 순위다.
 * 조건이 빈 순위는 "앞 순위에 해당하지 않는 나머지"라 거기까지 오면 늘 맞는다.
 *
 * 앞 순위를 입력이 없어 판별하지 못했으면 **확정하지 않는다** (certain: false).
 * 예: 1순위가 "청약 24회 이상"인데 청약 납입 횟수를 모르면, 3순위로 떨어진 것처럼 말하면 안 된다 —
 * 그 사람은 1순위일 수도 있다. 그때는 판별하지 못한 순위를 같이 돌려주고 화면이 "~면 N순위"로 말한다.
 */
import type { PriorityRank, RankCondition, SupplyTrack, UserProfile } from "@housing/schema";
import { applies, compare, profileValueFor, type RuleResult, type TrackResult } from "./match";

/** SKIP: 이 가구 유형에는 해당하지 않는 조건 (applies_to). 맞다고도 아니라고도 세지 않는다 */
type Status = "MATCH" | "MISMATCH" | "NEEDS_CHECK" | "SKIP";

export interface RankEstimate {
  /** 내 예상 순위. 판별한 순위가 하나도 맞지 않으면 null */
  rank: number | null;
  label?: string;
  /** 앞 순위를 모두 판별했는가 */
  certain: boolean;
  /** 입력이 없어 판별하지 못한 앞 순위 */
  undecided: number[];
  /** 이 순위의 접수일 (순위별 접수일이 따로 있는 공고) */
  apply_date?: string;
}

function evaluate(c: RankCondition, profile: UserProfile, today?: Date): Status {
  const app = applies(c.applies_to, profile);
  if (app === false) return "SKIP";
  if (app === null) return "NEEDS_CHECK";
  const actual = profileValueFor(c.category, profile, c.unit, today);
  if (actual === undefined || actual === null) return "NEEDS_CHECK";
  return compare(actual, c.operator, c.value) ? "MATCH" : "MISMATCH";
}

/**
 * 순위 하나의 판정. 가구 유형별로 갈린 조건("신혼부부는 미성년 자녀 / 한부모는 6세 이하 자녀")은
 * 내 유형에 해당하는 것만 본다. 해당하지 않는 조건을 맞은 것으로 세면 any_of에서 모두가 이 순위가 되고,
 * 어긋난 것으로 세면 all_of에서 아무도 이 순위가 못 된다. 전부 해당하지 않으면 이 순위가 아니다.
 * 조건이 애초에 없는 순위는 "나머지"라 늘 맞는다.
 */
function rankStatus(r: PriorityRank, profile: UserProfile, today?: Date): Status {
  if (r.conditions.length === 0) return "MATCH";
  const s = r.conditions.map((c) => evaluate(c, profile, today)).filter((x) => x !== "SKIP");
  if (s.length === 0) return "MISMATCH";
  if (r.mode === "any_of") return s.includes("MATCH") ? "MATCH" : s.includes("NEEDS_CHECK") ? "NEEDS_CHECK" : "MISMATCH";
  return s.includes("MISMATCH") ? "MISMATCH" : s.includes("NEEDS_CHECK") ? "NEEDS_CHECK" : "MATCH";
}

/** 순위 기준이 없는 트랙(추첨만 하는 공급)은 null */
export function expectedRank(track: Pick<SupplyTrack, "priority_ranks">, profile: UserProfile, today?: Date): RankEstimate | null {
  const ranks = [...(track.priority_ranks ?? [])].sort((a, b) => a.rank - b.rank);
  if (ranks.length === 0) return null;
  const undecided: number[] = [];
  for (const r of ranks) {
    const s = rankStatus(r, profile, today);
    if (s === "MATCH") {
      return { rank: r.rank, label: r.label, certain: undecided.length === 0, undecided, ...(r.apply_date ? { apply_date: r.apply_date } : {}) };
    }
    if (s === "NEEDS_CHECK") undecided.push(r.rank);
  }
  // 판별한 순위가 하나도 맞지 않았다. 못 가린 순위가 없으면 그건 확실한 결과다 — 어느 순위에도 해당하지 않는 사람
  return { rank: null, certain: undecided.length === 0, undecided };
}

/**
 * 지난 회차 마감 순위와 내 예상 순위를 견준다. 단정하지 않는다 — 지난 회차의 일이고 이번 회차는 다를 수 있다.
 *  - ahead: 마감 순위보다 앞 → 지난 회차 기준으로는 차례가 온 순위
 *  - same: 같은 순위에서 마감 → 그 순위 안에서 배점·추첨으로 갈렸다
 *  - behind: 마감 순위보다 뒤 → 지난 회차에는 차례가 오지 않았다
 */
export type RankVsPast = "ahead" | "same" | "behind";

export function rankVsPast(myRank: number, closedRank: number): RankVsPast {
  return myRank < closedRank ? "ahead" : myRank === closedRank ? "same" : "behind";
}

export const RANK_VS_PAST_LABEL: Record<RankVsPast, string> = {
  ahead: "지난 회차 기준 차례 옴",
  same: "같은 순위에서 경쟁",
  behind: "지난 회차 기준 차례 안 옴",
};

/**
 * 순위 안전망 (regionGuard·statusGuard와 같은 자리).
 *
 * 순위가 자격을 대신해 버린 추출을 막는다. 2026-09-24 v7 시험 추출에서 신혼·신생아 매입임대의
 * 자격(신혼부부·한부모·신생아 가구)이 순위 조건으로만 옮겨지고 rules에서 빠졌다 — 그러자 미혼에게 이 공고가
 * "조건 일치"로 나갔다(감사 오추천 360회). 공고문이 순위로 신청자 전부를 가른 공고에서 어느 순위에도
 * 해당하지 않으면 그 사람은 신청 대상이 아니다.
 *
 * 그래도 MISMATCH로 자르지 않는다 — 확인 필요 한 줄을 얹고 후보에서만 뺀다(status_guarded).
 * 앞 순위를 입력이 없어 못 가린 사람(certain: false)에게는 얹지 않는다. 입력하면 어느 순위인지 드러난다.
 * 조건 없는 "나머지" 순위가 있는 공고는 누구나 어느 순위엔가 들어가므로 여기에 걸리지 않는다.
 */
export function rankGuard(track: TrackResult, profile: UserProfile, today?: Date): TrackResult {
  if (!track.track.priority_ranks?.length || track.status_guarded) return track;
  const est = expectedRank(track.track, profile, today);
  if (!est || est.rank !== null || !est.certain) return track;
  const guard: RuleResult = {
    rule: {
      group_id: "__rank_guard__",
      category: "status",
      applies_to: {},
      operator: "in",
      value: [],
      source: { page: track.track.priority_ranks[0]!.source.page, text: track.track.priority_ranks.map((r) => `${r.rank}순위 ${r.label}`).join(" / ") },
      confidence: 0,
      verified: false,
    },
    status: "NEEDS_CHECK",
    reason: "이 공고는 신청자를 순위로 가르는데, 입력한 조건은 어느 순위에도 해당하지 않아요. 신청 대상인지 공고문의 순위 자격을 확인해 주세요.",
    skipped: false,
  };
  return {
    ...track,
    groups: [...track.groups, { group: { id: "__rank_guard__", mode: "all_of" as const, label: "신청 순위" }, status: "NEEDS_CHECK" as const, rules: [guard] }],
    summary: { ...track.summary, needs_check: track.summary.needs_check + 1 },
    status_guarded: true,
  };
}
