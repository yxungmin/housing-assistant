import { daysUntil } from "./format";

/**
 * 공고가 지금 접수 전인지, 접수 중인지, 끝났는지.
 *
 * 전에는 마감일 하나로만 셌다(D-n). 그래서 9월 25일에 접수를 시작하는 공고가 9월 23일에
 * "D-6"으로 "접수 임박"에 들어갔다 — 사람은 그걸 보고 지금 넣을 수 있다고 읽는다.
 * 마감된 공고도 목록에서 내려가기 전 일주일 동안 "내 조건에 맞는 공고" 수에 세어졌다.
 * 둘 다 홈이 답해야 하는 첫 질문, "지금 신청할 수 있나"를 틀리게 말하고 있었다.
 */
export type ApplyPhase =
  /** 접수 시작 전. startsIn은 시작까지 남은 날 (내일이면 1) */
  | { kind: "upcoming"; start: string; startsIn: number; daysLeft: number | null }
  /** 접수 중. 마감일을 모르면 daysLeft가 null */
  | { kind: "open"; daysLeft: number | null }
  | { kind: "closed" };

export function applyPhase(a: { apply_start?: string; apply_end?: string }, now = new Date()): ApplyPhase {
  const daysLeft = daysUntil(a.apply_end, now);
  if (daysLeft !== null && daysLeft < 0) return { kind: "closed" };
  const startsIn = daysUntil(a.apply_start, now);
  if (a.apply_start && startsIn !== null && startsIn > 0) return { kind: "upcoming", start: a.apply_start, startsIn, daysLeft };
  return { kind: "open", daysLeft };
}

/** 접수 중이고 마감이 이 날수 안인가. 접수 전·마감은 "곧 마감"이 아니다 */
export const closesWithin = (p: ApplyPhase, days: number): boolean =>
  p.kind === "open" && p.daysLeft !== null && p.daysLeft <= days;

/**
 * 목록·상세에 붙이는 짧은 표시.
 * 접수 전에는 D-n을 쓰지 않는다 — D-n은 "마감까지"로 읽히는데, 아직 넣을 수도 없는 공고에 붙으면 급한 척이 된다.
 */
export function phaseLabel(p: ApplyPhase): string {
  if (p.kind === "closed") return "마감";
  if (p.kind === "upcoming") {
    if (p.startsIn === 1) return "내일 접수 시작";
    const [, m, d] = p.start.split("-").map(Number) as [number, number, number];
    return `${m}.${d} 접수 시작`;
  }
  if (p.daysLeft === null) return "";
  return p.daysLeft === 0 ? "오늘 마감" : `D-${p.daysLeft}`;
}

/** 표시 색. 빨강은 "지금 넣어야 하는" 공고에만 쓴다 */
export function phaseTone(p: ApplyPhase): "danger" | "info" | "gray" {
  if (p.kind === "upcoming") return "info";
  if (p.kind === "open" && p.daysLeft !== null && p.daysLeft <= 14) return "danger";
  return "gray";
}

/** 목록 정렬 순서: 접수 중 → 접수 전 → 마감. 넣을 수 있는 공고가 위에 있어야 한다 */
export const phaseRank = (p: ApplyPhase): number => (p.kind === "open" ? 0 : p.kind === "upcoming" ? 1 : 2);
