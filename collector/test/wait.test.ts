import { describe, expect, it } from "vitest";
import { matchComplex, myhomeRegionCode, normalizeComplex, parseAsOf, parseWaitRows, summarize, WaitClient, type WaitRow } from "../src/wait/myhome";

/** 2026-09-21 마이홈 웹에서 실측한 행 모양 */
const WEB = {
  resultCnt: 241,
  resultList: [
    { hsmpNm: "수서주공1단지", rtsInsttNm: "LH서울", suplyTyNm: "영구임대", styleNm: "039.12", hshldCo: 2565, waitCo: 72, trmnatCo: 51, lastUpdtDt: "20260921020001", rnAdres: "서울특별시 강남구 광평로51길 49" },
    { hsmpNm: "수서주공1단지", rtsInsttNm: "LH서울", suplyTyNm: "영구임대", styleNm: "043.93", hshldCo: 2565, waitCo: 45, trmnatCo: 13, lastUpdtDt: "20260921020001" },
    { hsmpNm: "강남 에버시움", rtsInsttNm: "LH서울", suplyTyNm: "영구임대", styleNm: "021031", hshldCo: 1065, waitCo: 11, trmnatCo: 1, lastUpdtDt: "20260921020001" },
  ],
};

/** 2026-09-21 공식 API 실응답 껍데기 (items로 싸지 않고 body.item이 바로 배열) */
const API = { response: { body: { totalCount: "3778", numOfRows: "5", pageNo: "1", item: WEB.resultList } } };

describe("parseWaitRows", () => {
  it("웹 응답을 읽는다", () => {
    const rows = parseWaitRows(WEB);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ complex: "수서주공1단지", provider: "LH서울", unit_type: "039.12", households: 2565, waiting: 72, terminated: 51, as_of: "2026-09-21" });
  });

  it("공식 API 껍데기(body.item)를 읽는다", () => {
    expect(parseWaitRows(API)).toHaveLength(3);
  });

  it("items로 한 겹 더 싼 형태도 읽는다", () => {
    expect(parseWaitRows({ response: { body: { items: { item: WEB.resultList } } } })).toHaveLength(3);
  });

  it("기준일이 없으면 받아온 날짜로 채운다 — 공식 API는 lastUpdtDt를 주지 않는다", () => {
    const rows = parseWaitRows({ response: { body: { item: [{ hsmpNm: "관악산휴먼시아 3단지", waitCo: 29, trmnatCo: 10, styleNm: "39" }] } } }, "2026-09-21");
    expect(rows[0]!.as_of).toBe("2026-09-21");
    expect(rows[0]!.households).toBeUndefined();
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

describe("실데이터에서 드러난 것 (2026-09-21)", () => {
  it("마이홈 시도 코드는 행정표준코드와 둘이 다르다 — 강원 51, 전북 52", () => {
    expect(myhomeRegionCode("42")).toBe("51");
    expect(myhomeRegionCode("45")).toBe("52");
    expect(myhomeRegionCode("11")).toBe("11");
    expect(myhomeRegionCode("41")).toBe("41");
  });

  it("단지명 상투어를 걷어내면 공고 제목과 맞는다", () => {
    expect(normalizeComplex("군산나운주공4단지")).toBe("군산나운4");
    expect(normalizeComplex("관악산휴먼시아 3단지")).toBe("관악산3");
  });

  it("괄호 안 단지명을 살린다 — 지우면 매칭이 깨진다", () => {
    const rows: WaitRow[] = [{ complex: "군산나운주공4단지", waiting: 158 }];
    expect(matchComplex(rows, "군산시 (군산나운4) 영구임대주택 입주자격완화 예비입주자 모집")[0]?.complex).toBe("군산나운주공4단지");
  });

  it("제목에 단지명이 없으면 맞추지 않는다 — 남의 단지 숫자를 보여 주느니 안 보여 준다", () => {
    const rows: WaitRow[] = [{ complex: "관악산휴먼시아 3단지", waiting: 29 }];
    expect(matchComplex(rows, "2024년 서울특별시 영구임대주택 예비입주자 모집")).toEqual([]);
  });
});
