import { describe, expect, it } from "vitest";
import { matchComplex, parseAsOf, parseWaitRows, summarize, WaitClient, type WaitRow } from "../src/wait/myhome";

/** 2026-09-21 마이홈 웹에서 실측한 행 모양 */
const WEB = {
  resultCnt: 241,
  resultList: [
    { hsmpNm: "수서주공1단지", rtsInsttNm: "LH서울", suplyTyNm: "영구임대", styleNm: "039.12", hshldCo: 2565, waitCo: 72, trmnatCo: 51, lastUpdtDt: "20260921020001", rnAdres: "서울특별시 강남구 광평로51길 49" },
    { hsmpNm: "수서주공1단지", rtsInsttNm: "LH서울", suplyTyNm: "영구임대", styleNm: "043.93", hshldCo: 2565, waitCo: 45, trmnatCo: 13, lastUpdtDt: "20260921020001" },
    { hsmpNm: "강남 에버시움", rtsInsttNm: "LH서울", suplyTyNm: "영구임대", styleNm: "021031", hshldCo: 1065, waitCo: 11, trmnatCo: 1, lastUpdtDt: "20260921020001" },
  ],
};

/** 공공데이터포털 표준 응답 껍데기 */
const API = { response: { body: { items: { item: WEB.resultList } } } };

describe("parseWaitRows", () => {
  it("웹 응답을 읽는다", () => {
    const rows = parseWaitRows(WEB);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ complex: "수서주공1단지", provider: "LH서울", unit_type: "039.12", households: 2565, waiting: 72, terminated: 51, as_of: "2026-09-21" });
  });

  it("공공데이터포털 껍데기도 읽는다", () => {
    expect(parseWaitRows(API)).toHaveLength(3);
  });

  it("단지명이나 대기자 수가 없으면 버린다", () => {
    expect(parseWaitRows({ resultList: [{ hsmpNm: "", waitCo: 3 }, { hsmpNm: "가", waitCo: null }] })).toEqual([]);
  });

  it("빈 응답·오류 응답에도 터지지 않는다", () => {
    expect(parseWaitRows(null)).toEqual([]);
    expect(parseWaitRows({})).toEqual([]);
    expect(parseWaitRows({ response: { body: { items: "" } } })).toEqual([]);
  });
});

describe("parseAsOf", () => {
  it("14자리 일시에서 날짜만 뽑는다", () => {
    expect(parseAsOf("20260921020001")).toBe("2026-09-21");
  });
  it("짧으면 없는 것으로 둔다", () => {
    expect(parseAsOf("2026")).toBeUndefined();
    expect(parseAsOf(undefined)).toBeUndefined();
  });
});

describe("matchComplex", () => {
  const rows = parseWaitRows(WEB);

  it("공고 제목 안에 단지명이 들어 있으면 맞춘다", () => {
    const matched = matchComplex(rows, "수서주공1단지 영구임대주택 예비입주자 모집공고");
    expect(matched).toHaveLength(2);
    expect(matched[0]!.complex).toBe("수서주공1단지");
  });

  it("띄어쓰기가 달라도 맞춘다", () => {
    expect(matchComplex(rows, "강남에버시움 예비입주자 모집")).toHaveLength(1);
  });

  it("주소로도 맞출 수 있다", () => {
    expect(matchComplex(rows, "영구임대 모집공고", "서울특별시 강남구 광평로51길 49 수서주공1단지")).toHaveLength(2);
  });

  it("맞는 단지가 없으면 빈 배열", () => {
    expect(matchComplex(rows, "과천지식정보타운 S-11BL 행복주택 입주자 모집공고")).toEqual([]);
  });

  it("후보가 여럿이면 더 구체적인(긴) 이름을 고른다", () => {
    const two: WaitRow[] = [
      { complex: "행복", waiting: 1 },
      { complex: "행복주택 1단지", waiting: 2 },
    ];
    expect(matchComplex(two, "행복주택 1단지 모집")[0]!.complex).toBe("행복주택 1단지");
  });
});

describe("summarize", () => {
  it("주택형별로 많은 순으로 묶고 합계를 낸다", () => {
    const s = summarize(matchComplex(parseWaitRows(WEB), "수서주공1단지 모집공고"))!;
    expect(s.complex).toBe("수서주공1단지");
    expect(s.households).toBe(2565);
    expect(s.rows.map((r) => r.waiting)).toEqual([72, 45]);
    expect(s.total_waiting).toBe(117);
    expect(s.as_of).toBe("2026-09-21");
  });

  it("맞는 단지가 없으면 null", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("WaitClient", () => {
  it("시도 코드를 파라미터로 넣는다", async () => {
    let url = "";
    const fake: typeof fetch = async (u) => {
      url = String(u);
      return new Response(JSON.stringify(API), { status: 200 });
    };
    await new WaitClient("KEY", fake).list("11", "680");
    expect(url).toContain("moveWaitStsList");
    expect(url).toContain("brtcCode=11");
    expect(url).toContain("signguCode=680");
  });

  it("키가 없어 XML 오류가 와도 빈 배열", async () => {
    const fake: typeof fetch = async () => new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>등록되지 않은 서비스키</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", { status: 200 });
    expect(await new WaitClient("KEY", fake).list("11")).toEqual([]);
  });

  it("공고 하나에 대한 요약을 낸다", async () => {
    const fake: typeof fetch = async () => new Response(JSON.stringify(API), { status: 200 });
    const s = await new WaitClient("KEY", fake).forAnnouncement("11", "수서주공1단지 영구임대주택 예비입주자 모집공고");
    expect(s?.total_waiting).toBe(117);
  });
});
