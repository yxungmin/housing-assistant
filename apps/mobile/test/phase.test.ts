import { describe, expect, it } from "vitest";
import { applyPhase, closesWithin, phaseLabel, phaseRank, phaseTone } from "../src/lib/phase";

// 2026-09-23 정오
const NOW = new Date(2026, 8, 23, 12);

describe("applyPhase", () => {
  it("시작 전이면 접수 전이다 — 마감이 가까워도 D-n이 아니다", () => {
    // 실제로 있던 경우: 관악봉천 9.25~9.29를 9.23에 "D-6 · 접수 임박"으로 보여 줬다
    const p = applyPhase({ apply_start: "2026-09-25", apply_end: "2026-09-29" }, NOW);
    expect(p).toMatchObject({ kind: "upcoming", startsIn: 2 });
    expect(phaseLabel(p)).toBe("9.25 접수 시작");
    expect(closesWithin(p, 7)).toBe(false);
  });

  it("내일 시작이면 날짜 대신 '내일'", () => {
    expect(phaseLabel(applyPhase({ apply_start: "2026-09-24", apply_end: "2026-09-30" }, NOW))).toBe("내일 접수 시작");
  });

  it("오늘 시작하면 접수 중이다", () => {
    const p = applyPhase({ apply_start: "2026-09-23", apply_end: "2026-09-30" }, NOW);
    expect(p).toEqual({ kind: "open", daysLeft: 7 });
    expect(phaseLabel(p)).toBe("D-7");
  });

  it("마감일이 지났으면 마감이다", () => {
    const p = applyPhase({ apply_start: "2026-09-14", apply_end: "2026-09-17" }, NOW);
    expect(p.kind).toBe("closed");
    expect(phaseLabel(p)).toBe("마감");
    expect(closesWithin(p, 7)).toBe(false);
  });

  it("오늘 마감은 아직 접수 중이다", () => {
    const p = applyPhase({ apply_start: "2026-09-20", apply_end: "2026-09-23" }, NOW);
    expect(p).toEqual({ kind: "open", daysLeft: 0 });
    expect(phaseLabel(p)).toBe("오늘 마감");
  });

  it("시작일을 모르면 마감일만으로 판단한다", () => {
    expect(applyPhase({ apply_end: "2026-09-29" }, NOW)).toEqual({ kind: "open", daysLeft: 6 });
  });

  it("날짜가 둘 다 없으면 접수 중으로 두되 D-n을 지어내지 않는다", () => {
    const p = applyPhase({}, NOW);
    expect(p).toEqual({ kind: "open", daysLeft: null });
    expect(phaseLabel(p)).toBe("");
  });
});

describe("표시", () => {
  it("빨강은 지금 넣어야 하는 공고에만", () => {
    expect(phaseTone(applyPhase({ apply_start: "2026-09-25", apply_end: "2026-09-29" }, NOW))).toBe("info");
    expect(phaseTone(applyPhase({ apply_end: "2026-09-29" }, NOW))).toBe("danger");
    expect(phaseTone(applyPhase({ apply_end: "2026-12-29" }, NOW))).toBe("gray");
    expect(phaseTone(applyPhase({ apply_end: "2026-09-01" }, NOW))).toBe("gray");
  });

  it("정렬은 접수 중 → 접수 전 → 마감", () => {
    const ranks = [
      applyPhase({ apply_end: "2026-09-01" }, NOW),
      applyPhase({ apply_start: "2026-09-25", apply_end: "2026-09-29" }, NOW),
      applyPhase({ apply_end: "2026-09-29" }, NOW),
    ].map(phaseRank);
    expect(ranks).toEqual([2, 1, 0]);
  });
});
