import type { Pricing, UserProfile } from "@housing/schema";
import { isLowTier } from "./units";

/**
 * 같은 주택형에 소득·계층별로 가격 행이 여럿일 때, 이 사람에게 맞는 행.
 *
 * 전에는 첫 행을 기본으로 골랐다. 공고문은 대개 낮은 소득부터 적어서, 서울 영구임대에서
 * 수급자가 아닌 사람에게 **수급자 요율**로 필요 현금을 계산해 보여 줬다(2026-09-23).
 * 유료 화면의 첫 숫자가 그 사람의 숫자가 아니었다.
 *
 * 공고문의 구간 이름은 세 가지 꼴로 온다:
 *  - "수급자 / 수급자 외", "가군(생계·의료급여수급자 등) / 나군(일반 등)" → 계층 자격으로
 *  - "청년(소득 있음) / 청년(소득 없음)" → 연소득으로
 *  - "1구간(기준 중위소득 30% 이하) … 6구간" → 우리가 가진 값으로 가를 수 없다
 * 가를 수 없으면 **월세가 가장 비싼 행**을 쓴다. 매입임대(lib/units.ts unitRent)와 같은 원칙이다 —
 * 주거비를 낮게 보여 주는 실수가 높게 보여 주는 실수보다 나쁘다.
 */
export function tierFit(tier: string | undefined, profile: UserProfile | null | undefined): number {
  if (!tier) return 0;
  const low = isLowTier(profile);
  const income = profile?.annual_income;
  // "수급자 외"·"나군(일반 등)"을 먼저 본다 — 그 안에도 "수급자"라는 글자가 들어 있다
  if (/수급자\s*외|비수급|일반|나군|그\s*외/.test(tier)) return low ? -1 : 2;
  if (/수급|가군|차상위|한부모/.test(tier)) return low ? 2 : -2;
  if (/소득\s*(없음|無)/.test(tier)) return income === 0 ? 2 : income !== undefined ? -2 : 0;
  if (/소득\s*(있음|有)/.test(tier)) return income !== undefined && income > 0 ? 2 : income === 0 ? -2 : 0;
  return 0;
}

/** 구간을 우리 값으로 가를 수 없어 가장 비싼 행을 골랐는가 — 화면이 그렇게 밝혀 적는다 */
export const isIncomeBracket = (tier: string | undefined): boolean => !!tier && /\d+\s*구간/.test(tier);

/**
 * 기본으로 보여 줄 행의 자리. 첫 행과 **같은 공급 유형·같은 주택형** 안에서만 고른다 —
 * 가격만 보고 고르면 가장 넓은 집이 기본이 된다.
 */
export function preferredRow<T extends { pricing: Pricing; trackName: string }>(rows: T[], profile: UserProfile | null | undefined): number {
  const first = rows[0];
  if (!first) return 0;
  let best = 0;
  let bestKey: [number, number] = [-Infinity, -Infinity];
  rows.forEach((r, i) => {
    if (r.trackName !== first.trackName || r.pricing.unit_type !== first.pricing.unit_type) return;
    const key: [number, number] = [tierFit(r.pricing.tier, profile), r.pricing.monthly_rent ?? 0];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
      best = i;
      bestKey = key;
    }
  });
  return best;
}
