import { describe, expect, it } from "vitest";
import { cutlineFileId, rankOf } from "../src/lh/cutline";

/**
 * 커트라인 문구는 사람이 읽으라고 쓴 한 줄이다 — "1순위, 9점  당첨 (1순위, 8점  경쟁)".
 * 우리는 여기서 **순위만** 뽑는다. 점수는 공고마다 배점이 달라 비교가 안 되는데,
 * 순위는 사용자가 자기 순위와 바로 견줄 수 있다.
 */
describe("마감 순위 읽기", () => {
  it("커트라인 문구에서 순위를 뽑는다", () => {
    expect(rankOf("1순위, 9점  당첨 (1순위, 8점  경쟁)")).toBe(1);
    expect(rankOf("2순위, 5점  당첨")).toBe(2);
    expect(rankOf("3순위")).toBe(3);
  });

  it("순위가 없으면 지어내지 않는다", () => {
    expect(rankOf("미달")).toBeUndefined();
    expect(rankOf("")).toBeUndefined();
    expect(rankOf(undefined)).toBeUndefined();
  });

  it("점수를 순위로 착각하지 않는다 — 앞의 숫자가 순위다", () => {
    expect(rankOf("1순위, 9점")).toBe(1);
  });
});

describe("커트라인 첨부 id", () => {
  it("팝업 HTML에서 파일 id를 뽑는다", () => {
    expect(cutlineFileId(`<a href="#" onclick="fileDownLoad('68664336')">받기</a>`)).toBe("68664336");
  });

  it("첨부가 없으면 undefined — 모든 공고에 커트라인이 붙지는 않는다", () => {
    expect(cutlineFileId("<html>커트라인 없음</html>")).toBeUndefined();
  });
});
