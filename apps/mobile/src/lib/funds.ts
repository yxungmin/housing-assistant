/**
 * "조건은 맞는데, 돈이 되나".
 *
 * 조건 일치는 무료로 보여 준다. 그런데 조건이 다 맞아도 보증금을 못 대면 못 간다 —
 * 지금은 그 사실이 비용 화면에 들어가야만 보여서, 목록에서 "8개 중 8개 일치"를 본 사람은
 * 된다고 믿은 채 나간다. 실제로 현금이 억 단위로 모자랄 수 있다.
 *
 * 판정 자체는 기기에서 공짜로 나오므로(엔진이 로컬) **부족한지 여부는 무료로 알리고,
 * 얼마인지만 유료로 둔다.** 잠긴 것이 무엇인지 사용자가 정확히 알게 되고,
 * 조건만 보고 신청했다가 계약금을 못 내는 일도 막는다.
 *
 * 가장 싼 방을 기준으로 본다 — 제일 유리한 경우에도 모자라면 그건 확실한 사실이다.
 * 비싼 방을 기준으로 삼으면 갈 수 있는 사람에게도 겁을 준다.
 */
import { computeRentalCost } from "@housing/engine";
import type { LoanProduct, UserProfile } from "@housing/schema";
import type { Announcement } from "@/data/announcements";

export type FundsStatus =
  /** 가장 싼 방으로도 현금이 모자란다 */
  | "short"
  /** 마련할 수 있다 */
  | "ok"
  /** 판단할 수 없다 — 임대조건을 못 읽었거나 보유 현금을 안 넣었다 */
  | "unknown";

export interface Funds {
  status: FundsStatus;
  /** 부족액 (원). status가 short일 때만. 화면에서 가릴지는 구독 상태가 정한다 */
  shortfall: number;
  /** 기준이 된 방 이름 ("59㎡") */
  unitLabel?: string;
}

const UNKNOWN: Funds = { status: "unknown", shortfall: 0 };

export function fundsFor(a: Announcement, profile: UserProfile | null, loans: LoanProduct[]): Funds {
  if (!profile || profile.cash_on_hand === undefined) return UNKNOWN;

  const rows = a.extraction.tracks.flatMap((t) => t.pricing.filter((x) => x.kind === "rental" && x.deposit !== undefined));
  if (rows.length === 0) return UNKNOWN;

  // 보증금이 가장 낮은 방. 여기서도 모자라면 이 공고는 어느 방으로도 모자란다.
  const cheapest = rows.reduce((lo, x) => ((x.deposit ?? 0) < (lo.deposit ?? 0) ? x : lo));
  let cost;
  try {
    cost = computeRentalCost(cheapest, loans, profile);
  } catch {
    return UNKNOWN;
  }
  const label = cheapest.tier ? `${cheapest.unit_type} ${cheapest.tier}` : cheapest.unit_type;
  return cost.shortfall > 0
    ? { status: "short", shortfall: cost.shortfall, unitLabel: label }
    : { status: "ok", shortfall: 0, unitLabel: label };
}

/**
 * 목록 카드에 붙일 한 줄. 금액은 넣지 않는다 — 그건 유료다.
 * "확인 필요"가 아니라 "부족할 수 있어요"로 쓴다. 대출 한도·관리비가 추정이라 단정할 수 없고,
 * 단정하면 갈 수 있는 사람을 돌려보내게 된다.
 */
export function fundsNote(f: Funds): string | null {
  if (f.status === "short") return "현금이 부족할 수 있어요";
  return null;
}
