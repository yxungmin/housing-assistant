import { describe, expect, it } from "vitest";
import type { Announcement } from "../src/data/announcements";
import { changeSummary, detectChanges, diffAnnouncement } from "../src/lib/changes";

const src = { page: 15, text: "x" };
const base: Announcement = {
  id: "a1",
  lh_id: "TEST-1",
  title: "테스트 공고",
  housing_type: "long_term_rental",
  region_code: "11",
  region_name: "서울",
  status: "AUTO",
  apply_end: "2026-10-05",
  extraction: {
    title: "테스트 공고",
    housing_type: "long_term_rental",
    schedule: {},
    notes: [],
    tracks: [
      {
        name: "일반공급",
        unit_types: [{ name: "59㎡" }],
        rule_groups: [{ id: "g", mode: "all_of", label: "기본" }],
        rules: [
          { group_id: "g", category: "asset", applies_to: {}, operator: "lte", value: 662_000_000, unit: "KRW", source: src, confidence: 0.9, verified: false },
        ],
        pricing: [{ unit_type: "59㎡", kind: "rental", deposit: 514_020_000, monthly_rent: 0, source: src }],
      },
    ],
  },
};

/** 깊은 복사 후 수정 */
const edit = (f: (a: Announcement) => void): Announcement => {
  const copy = structuredClone(base);
  f(copy);
  return copy;
};

describe("changes", () => {
  it("바뀐 게 없으면 아무것도 알리지 않는다", () => {
    expect(diffAnnouncement(base, structuredClone(base))).toEqual([]);
  });

  it("보증금이 바뀌면 이전 값과 새 값을 함께 알린다", () => {
    const after = edit((a) => { a.extraction.tracks[0]!.pricing[0]!.deposit = 435_240_000; });
    const [c] = diffAnnouncement(base, after);
    expect(c!.kind).toBe("price");
    expect(c!.text).toContain("5억 1,402만");
    expect(c!.text).toContain("4억 3,524만");
  });

  it("마감일이 바뀌면 알린다", () => {
    const after = edit((a) => { a.apply_end = "2026-10-12"; });
    expect(diffAnnouncement(base, after)).toEqual([{ kind: "deadline", text: "접수 마감이 2026년 10월 12일로 바뀌었어요" }]);
  });

  it("자격 조건이 늘거나 빠지면 알린다", () => {
    const after = edit((a) => {
      a.extraction.tracks[0]!.rules.push({ ...a.extraction.tracks[0]!.rules[0]!, category: "age", operator: "gte", value: 19, unit: "years" });
    });
    expect(diffAnnouncement(base, after)[0]).toMatchObject({ kind: "rule" });
    expect(diffAnnouncement(base, after)[0]!.text).toContain("1개 추가");
  });

  it("트랙 이름·순번만 달라진 것은 변경이 아니다", () => {
    const after = edit((a) => { a.extraction.tracks[0]!.name = "일반공급(변경)"; });
    expect(diffAnnouncement(base, after)).toEqual([]);
  });

  it("사람 검수가 끝나면 그것도 알린다", () => {
    const after = edit((a) => { a.status = "VERIFIED"; });
    expect(diffAnnouncement(base, after)).toEqual([{ kind: "verified", text: "사람이 공고문과 대조해 확인했어요" }]);
  });

  it("금액이 먼저, 줄 수는 3줄까지", () => {
    const after = edit((a) => {
      a.apply_end = "2026-10-12";
      a.status = "VERIFIED";
      a.extraction.tracks[0]!.pricing[0]!.deposit = 435_240_000;
      a.extraction.tracks[0]!.pricing[0]!.monthly_rent = 300_000;
      a.extraction.tracks[0]!.rules = [];
    });
    const out = diffAnnouncement(base, after);
    expect(out).toHaveLength(3);
    expect(out[0]!.kind).toBe("price");
  });

  it("관심 공고만 본다", () => {
    const after = [edit((a) => { a.extraction.tracks[0]!.pricing[0]!.deposit = 1; })];
    expect(detectChanges([base], after, [])).toEqual([]);
    expect(detectChanges([base], after, ["a1"])).toHaveLength(1);
  });

  it("처음 보는 공고는 변경이 아니다", () => {
    const fresh = { ...base, id: "a2" };
    expect(detectChanges([base], [base, fresh], ["a1", "a2"])).toEqual([]);
  });

  it("알림 한 줄은 첫 줄 + 나머지 개수", () => {
    const after = edit((a) => {
      a.apply_end = "2026-10-12";
      a.extraction.tracks[0]!.pricing[0]!.deposit = 435_240_000;
    });
    const [rec] = detectChanges([base], [after], ["a1"]);
    expect(changeSummary(rec!)).toContain("외 1건");
  });
});
