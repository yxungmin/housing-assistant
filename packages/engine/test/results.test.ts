import { describe, expect, it } from "vitest";
import { complexNames, matchPastResults, normalizeComplex, pastResultText, toughest, type PastResult } from "../src/results";
import type { SupplyUnit } from "@housing/schema";

const r = (over: Partial<PastResult> = {}): PastResult => ({
  complex: "전북혁신 A10블럭",
  unit_no: "61130023",
  announced_at: "2026-09-22",
  households: 30,
  applicants: 216,
  competition: 7.2,
  closed_rank: 1,
  ...over,
});

describe("단지명 정규화", () => {
  it("블럭·블록·BL 표기를 하나로 모은다", () => {
    const n = normalizeComplex("전북혁신 A10블럭");
    expect(normalizeComplex("전북혁신 A10블록")).toBe(n);
    expect(normalizeComplex("전북혁신 A-10 BL")).toBe(n);
  });

  it("괄호 주석은 단지를 가르는 정보가 아니다", () => {
    expect(normalizeComplex("강동암사동(광채빌라)")).toBe(normalizeComplex("강동암사동"));
  });

  it("다른 단지를 같게 만들지 않는다 — 표기만 지우고 글자는 남긴다", () => {
    expect(normalizeComplex("전북혁신 A10블럭")).not.toBe(normalizeComplex("전북혁신 A11블럭"));
    expect(normalizeComplex("서울금천")).not.toBe(normalizeComplex("서울오류"));
  });
});

describe("공고에서 단지명 뽑기", () => {
  it("LH 공고명의 하이픈 뒤가 단지다", () => {
    expect(complexNames({ title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신 A10블럭" })).toContain("전북혁신 A10블럭");
  });

  it("units의 complex도 모은다", () => {
    const units = [{ id: "1", address: "x", complex: "광채빌라" }] as SupplyUnit[];
    expect(complexNames({ title: "매입임대 모집", units })).toContain("광채빌라");
  });
});

/**
 * 잘못 이은 경쟁률은 없는 것보다 나쁘다. 사용자는 그걸 근거로 신청을 정하고,
 * 나중에 다른 단지 숫자였다는 걸 알면 나머지 숫자도 전부 의심한다.
 */
describe("잇기 — 틀릴 바에는 안 보여 준다", () => {
  it("정규화해서 같으면 잇는다", () => {
    const out = matchPastResults({ title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신 A-10 BL" }, [r()]);
    expect(out).toHaveLength(1);
  });

  it("이름이 다르면 잇지 않는다 — 부분 일치를 쓰지 않는다", () => {
    expect(matchPastResults({ title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신 A11블럭" }, [r()])).toEqual([]);
    expect(matchPastResults({ title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신" }, [r()])).toEqual([]);
  });

  it("이름이 같은데 단지 번호가 갈리면 포기한다 — 어느 쪽인지 모른다", () => {
    const pool = [r(), r({ unit_no: "99999999" })];
    expect(matchPastResults({ title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신 A10블럭" }, pool)).toEqual([]);
  });

  it("여러 회차면 가장 최근 것만 준다 — 오래된 회차는 기준이 다르다", () => {
    const pool = [r({ announced_at: "2025-03-01", closed_rank: 2 }), r({ announced_at: "2026-09-22" })];
    const out = matchPastResults({ title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신 A10블럭" }, pool);
    expect(out).toHaveLength(1);
    expect(out[0]!.announced_at).toBe("2026-09-22");
  });

  it("단지명을 못 찾으면 아무것도 잇지 않는다", () => {
    expect(matchPastResults({ title: "하이픈없는공고명" }, [r()])).toEqual([]);
    expect(matchPastResults({}, [r()])).toEqual([]);
  });
});

describe("화면 문구", () => {
  it("순위를 앞세우고 경쟁률은 뒤에 붙인다", () => {
    expect(pastResultText(r())).toBe("지난 회차는 1순위에서 마감됐어요 (7.2대 1)");
  });

  it("순위를 모르면 경쟁률만 말한다", () => {
    expect(pastResultText(r({ closed_rank: undefined }))).toBe("지난 회차 경쟁률은 7.2대 1이었어요");
  });

  it("둘 다 모르면 아무 말도 하지 않는다 — 빈 줄을 만들지 않는다", () => {
    expect(pastResultText(r({ closed_rank: undefined, competition: undefined }))).toBeNull();
  });

  it("점수는 쓰지 않는다 — 공고마다 배점이 달라 비교할 수 없다", () => {
    expect(pastResultText(r())).not.toContain("점");
  });
});

describe("대표 주택형", () => {
  it("가장 치열했던 쪽을 고른다 — 낙관적인 값을 앞에 두지 않는다", () => {
    const rows = [r({ closed_rank: 2, competition: 1.1 }), r({ closed_rank: 1, competition: 7.2 })];
    expect(toughest(rows)?.closed_rank).toBe(1);
  });

  it("순위가 같으면 경쟁률이 높은 쪽", () => {
    const rows = [r({ closed_rank: 1, competition: 3 }), r({ closed_rank: 1, competition: 9 })];
    expect(toughest(rows)?.competition).toBe(9);
  });

  it("빈 목록이면 없음", () => {
    expect(toughest([])).toBeUndefined();
  });
});

describe("PAN_ID가 있으면 이름을 맞추지 않는다", () => {
  it("같은 공고의 결과는 id로 정확히 잇는다", () => {
    const pool = [r({ pan_id: "2015122300019968", complex: "엉뚱한이름" })];
    const out = matchPastResults({ lh_id: "2015122300019968", title: "무관한 제목" }, pool);
    expect(out).toHaveLength(1);
  });

  it("id가 다르면 이름 매칭으로 넘어간다", () => {
    const pool = [r({ pan_id: "다른id" })];
    expect(matchPastResults({ lh_id: "내id", title: "전주시 국민임대주택 예비입주자 모집 공고-전북혁신 A10블럭" }, pool)).toHaveLength(1);
  });
});

/**
 * 하이픈은 단지명 앞에만 있는 게 아니다. "과천지식정보타운 S-11BL 행복주택(리츠) 입주자 모집공고"에서
 * 첫 하이픈 뒤를 다 가져오면 제목 꼬리가 단지명으로 둔갑한다. 그러면 엉뚱한 단지와 이어질 수 있다.
 */
describe("제목 꼬리를 단지명으로 착각하지 않는다", () => {
  it("공고명 안의 하이픈에 속지 않는다", () => {
    const names = complexNames({ title: "과천지식정보타운 S-11BL 행복주택(리츠) 입주자 모집공고" });
    expect(names).toEqual([]);
  });

  it("진짜 단지 꼬리표는 잡는다", () => {
    expect(complexNames({ title: "대전반석4 국민임대주택 예비입주자 모집공고(2026.05.15)-대전반석4" })).toEqual(["대전반석4"]);
  });

  it("꼬리가 제목처럼 길면 단지명이 아니다", () => {
    expect(complexNames({ title: "어떤공고-아주 긴 무언가 입주자 모집공고입니다 정말로" })).toEqual([]);
  });
});

describe("단지명 안에 하이픈이 있어도 자른다", () => {
  it("모집공고명이 끝나는 자리에서 자른다", () => {
    expect(complexNames({ title: "광주하남 행복주택(고령자유형) 입주자격완화, 선계약 후검증 예비입주자 모집-광주하남A-1BL" }))
      .toEqual(["광주하남A-1BL"]);
  });
});
