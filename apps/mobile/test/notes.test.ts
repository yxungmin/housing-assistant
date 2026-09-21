import { describe, expect, it } from "vitest";
import { userFacingNotes } from "../src/lib/notes";

/** 2026-09-22 실제로 화면에 나갔던 문장들 (과천지식정보타운 공고) */
const REAL = [
  "입주는 2026년 5월로 예정되어 있으며 공사현황 등의 사정에 따라 변경될 수 있음(p.4). 정확한 일자가 없어 move_in은 null로 둠.",
  "총 모집호수 684호(우선공급 342, 일반공급 342). 총 건설호수 846세대 중 과천과천 공공주택지구 이주자 임시사용 161세대 및 가정어린이집 1세대 제외(p.2).",
  "일반공급 중 16A형과 26A형의 대학생 계층과 청년 계층(소득유무 무관)은 통합 추첨하여 공급함(p.4). 따라서 해당 일반공급 물량(16A 105호, 26A 33호)은 두 계층 트랙에 중복 기재됨.",
  "거주지 요건은 '과천시'(시군구)이나 스키마의 residence는 시도 코드 기준이므로 경기도 코드 '41'로 기재함. 실제 요건은 과천시(41290) 거주/재학/소득근거지임.",
];

describe("userFacingNotes", () => {
  const out = userFacingNotes(REAL);

  it("우리 필드 이름이 든 문장을 뺀다", () => {
    expect(out.join(" ")).not.toContain("move_in");
    expect(out.join(" ")).not.toContain("residence");
  });

  it("우리 말로 쓴 작업 메모를 뺀다", () => {
    const all = out.join(" ");
    expect(all).not.toContain("스키마");
    expect(all).not.toContain("트랙");
    expect(all).not.toContain("null");
    expect(all).not.toContain("기재함");
  });

  it("같은 메모의 쓸모 있는 문장은 남긴다 — 통째로 버리면 알아야 할 것까지 사라진다", () => {
    expect(out[0]).toBe("입주는 2026년 5월로 예정되어 있으며 공사현황 등의 사정에 따라 변경될 수 있음(p.4).");
    expect(out.at(-1)).toBe("실제 요건은 과천시(41290) 거주/재학/소득근거지임.");
  });

  it("문제없는 메모는 그대로 둔다", () => {
    expect(out[1]).toBe(REAL[1]);
  });

  it("쪽수 표기(p.4)에서 문장을 자르지 않는다", () => {
    expect(userFacingNotes(["공급 대상은 무주택자임(p.4). 자세한 내용은 공고문 참고."])).toEqual([
      "공급 대상은 무주택자임(p.4). 자세한 내용은 공고문 참고.",
    ]);
  });

  it("남는 문장이 없으면 그 메모는 빠진다", () => {
    expect(userFacingNotes(["스키마에 없어 생성하지 않음."])).toEqual([]);
  });

  it("빈 입력에도 터지지 않는다", () => {
    expect(userFacingNotes(undefined)).toEqual([]);
    expect(userFacingNotes([])).toEqual([]);
  });

  it("공고문에 흔한 영문 약어는 필드 이름으로 보지 않는다", () => {
    expect(userFacingNotes(["LH 청약플러스에서 신청함. 16A형은 84㎡임."])).toHaveLength(1);
  });
});
