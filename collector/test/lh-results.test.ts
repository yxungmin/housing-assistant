import { describe, expect, it } from "vitest";
import { parseEntries } from "../src/lh/results";

/**
 * 응답 HTML 안에 박힌 `list.push({...})`를 읽는다. 표를 파싱하지 않는 이유는
 * 이쪽이 이미 구조화돼 있어서다 — 열 순서가 바뀌어도 깨지지 않는다.
 */
const SAMPLE = `
<script>
  list.push({
    uppAisTpCd : '06',
    aisTpCd : '10',
    panNm : '서울금천 행복주택(산업단지형) 예비입주자 모집공고(2026.05.15)-서울금천 행복주택',
    pzwrAncDt : '2026.09.18',
    panId : '2015122300019968',
    rnk : '0',
    pzwrBtn1 : '',
    pzwrBtn2 : '예비자명단'
  });
  list.push({
    uppAisTpCd : '01',
    aisTpCd : '01',
    panNm : '전주시 국민임대주택 모집 공고([sgQtRp]26.05.15.)',
    pzwrAncDt : '2026.09.22',
    panId : 'BN-0007885',
    pzwrBtn1 : '낙찰자명단',
    pzwrBtn2 : ''
  });
</script>`;

describe("당첨자 발표 목록 파싱", () => {
  const rows = parseEntries(SAMPLE);

  it("행을 모두 읽는다", () => {
    expect(rows).toHaveLength(2);
  });

  it("panId를 읽는다 — 이게 모집공고와 잇는 열쇠다", () => {
    expect(rows[0]!.panId).toBe("2015122300019968");
  });

  it("LH가 XSS 필터로 바꿔 둔 따옴표를 되돌린다", () => {
    expect(rows[1]!.panNm).toContain("('26.05.15.)");
    expect(rows[1]!.panNm).not.toContain("sgQtRp");
  });

  it("명단 버튼의 유무를 그대로 남긴다 — 빈 문자열과 값이 구분돼야 한다", () => {
    expect(rows[0]!.pzwrBtn1).toBe("");
    expect(rows[0]!.pzwrBtn2).toBe("예비자명단");
  });

  it("panId가 없는 덩이는 버린다", () => {
    expect(parseEntries("list.push({ foo : 'bar' });")).toEqual([]);
  });

  it("빈 HTML에서도 죽지 않는다", () => {
    expect(parseEntries("")).toEqual([]);
  });
});
