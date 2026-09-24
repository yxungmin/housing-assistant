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
import { applies, compare, profileValueFor } from "./match";

type Status = "MATCH" | "MISMATCH" | "NEEDS_CHECK";

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

function evaluate(c: RankCondition, profile: UserProfile): Status {
  const app = applies(c.applies_to, profile);
  // 이 가구 유형에 적용되지 않는 조건은 이 순위를 막지 않는다
  if (app === false) return "MATCH";
  if (app === null) return "NEEDS_CHECK";
  const actual = profileValueFor(c.category, profile, c.unit);
  if (actual === undefined || actual === null) return "NEEDS_CHECK";
  return compare(actual, c.operator, c.value) ? "MATCH" : "MISMATCH";
}

function rankStatus(r: PriorityRank, profile: UserProfile): Status {
  const s = r.conditions.map((c) => evaluate(c, profile));
  if (s.length === 0) return "MATCH";
  if (r.mode === "any_of") return s.includes("MATCH") ? "MATCH" : s.includes("NEEDS_CHECK") ? "NEEDS_CHECK" : "MISMATCH";
  return s.includes("MISMATCH") ? "MISMATCH" : s.includes("NEEDS_CHECK") ? "NEEDS_CHECK" : "MATCH";
}

/** 순위 기준이 없는 트랙(추첨만 하는 공급)은 null */
export function expectedRank(track: Pick<SupplyTrack, "priority_ranks">, profile: UserProfile): RankEstimate | null {
  const ranks = [...(track.priority_ranks ?? [])].sort((a, b) => a.rank - b.rank);
  if (ranks.length === 0) return null;
  const undecided: number[] = [];
  for (const r of ranks) {
    const s = rankStatus(r, profile);
    if (s === "MATCH") {
      return { rank: r.rank, label: r.label, certain: undecided.length === 0, undecided, ...(r.apply_date ? { apply_date: r.apply_date } : {}) };
    }
    if (s === "NEEDS_CHECK") undecided.push(r.rank);
  }
  return { rank: null, certain: false, undecided };
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
