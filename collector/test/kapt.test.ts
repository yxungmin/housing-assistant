import { describe, expect, it } from "vitest";
import { KaptClient, KaptError, matchKaptComplex, parseBasis, parseComplexList, pickDistrictSample, shiftMonth, sumCostItem, type KaptComplex } from "../src/maintenance/kapt";

/** 2026-09-24 실응답 (강서구 목록 3건) */
const LIST = {
  response: {
    body: {
      items: [
        { kaptCode: "A10021770", kaptName: "염창현대2차아파트", bjdCode: "1150010100", as1: "서울특별시", as2: "강서구", as3: "염창동", as4: null },
        { kaptCode: "A10021935", kaptName: "염창삼성한아름아파트", bjdCode: "1150010100" },
        { kaptCode: "A10022042", kaptName: "염창대림아파트", bjdCode: "1150010100" },
      ],
      numOfRows: 3,
      pageNo: 1,
      totalCount: 212,
    },
    header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
  },
};

/** 2026-09-24 실응답 (기본정보 V5) */
const BASIS = {
  response: {
    body: {
      item: {
        kaptCode: "A10027875", kaptName: "괴정 경성스마트W아파트", codeSaleNm: "분양", codeHeatNm: "개별난방", kaptTarea: 15040.163,
        kaptDongCnt: "3", kaptdaCnt: 182.0, kaptUsedate: "20150806", hoCnt: 182, kaptMarea: 15040.163, privArea: "9014.0338", bjdCode: "2638010100",
      },
    },
  },
};

/** 2026-09-24 실응답 (인건비 항목) */
const LABOR = {
  response: {
    body: {
      item: { kaptCode: "A10027875", kaptName: "괴정 경성스마트W아파트", pay: 3638708, sundryCost: 290553, bonus: 0, pension: 346432, accidentPremium: 35098, employPremium: 42525, nationalPension: 71864, healthPremium: 151108, welfareBenefit: 153768 },
    },
  },
};

describe("K-apt 응답 읽기", () => {
  it("단지 목록", () => {
    const { rows, total } = parseComplexList(LIST);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ kapt_code: "A10021770", name: "염창현대2차아파트", bjd_code: "1150010100" });
    expect(total).toBe(212);
  });

  it("기본정보 — 전용면적합은 문자열로 온다", () => {
    const b = parseBasis(BASIS)!;
    expect(b.private_area_m2).toBeCloseTo(9014.0338);
    expect(b.levy_area_m2).toBeCloseTo(15040.163);
    expect(b.households).toBe(182);
    expect(b.sale_kind).toBe("분양");
    expect(b.used_from).toBe("2015-08-06");
  });

  it("전용면적합이 0이면 없는 것으로 본다 — 나눗셈의 분모다", () => {
    expect(parseBasis({ response: { body: { item: { kaptCode: "X", privArea: "0" } } } })!.private_area_m2).toBeUndefined();
  });

  it("항목 합계 — 코드·이름을 뺀 숫자 필드를 다 더한다", () => {
    expect(sumCostItem(LABOR)).toBe(3638708 + 290553 + 346432 + 35098 + 42525 + 71864 + 151108 + 153768);
    expect(sumCostItem({ response: { body: { item: { kaptCode: "X", kaptName: "Y", heatC: "1200", heatP: "3400" } } } })).toBe(4600);
    expect(sumCostItem({ response: { body: {} } })).toBeUndefined();
    expect(sumCostItem(null)).toBeUndefined();
  });

  it("달 이동", () => {
    expect(shiftMonth("202601", 2)).toBe("202511");
    expect(shiftMonth("202609", 8)).toBe("202601");
  });
});

describe("단지 맞추기", () => {
  const rows: KaptComplex[] = [
    { kapt_code: "A", name: "염창현대2차아파트" },
    { kapt_code: "B", name: "동문디이스트" },
    { kapt_code: "C", name: "래미안" },
  ];

  it("주소의 건물명으로 맞춘다", () => {
    expect(matchKaptComplex(rows, { title: "서울 강서구 청년매입임대 입주자 모집", address: "서울특별시 강서구 공항대로81길 14 (염창역 동문디이스트)" })?.kapt_code).toBe("B");
  });

  it("공급기관 단지명이 있으면 그것도 본다", () => {
    expect(matchKaptComplex(rows, { title: "강서 행복주택 모집", complex: "염창현대2차" })?.kapt_code).toBe("A");
  });

  it("짧은 이름은 우연히 걸리므로 버린다", () => {
    expect(matchKaptComplex(rows, { title: "래미안 어쩌구 공고" })).toBeNull();
  });

  it("지역 표본은 임대 성격 단지를 앞에 둔다", () => {
    const sample = pickDistrictSample([{ kapt_code: "1", name: "가나아파트" }, { kapt_code: "2", name: "마곡엠밸리7단지" }, { kapt_code: "3", name: "다라아파트" }], 2);
    expect(sample.map((s) => s.kapt_code)).toEqual(["2", "1"]);
  });
});

/** 경로에 따라 응답을 돌려주는 가짜 fetch. 호출 URL을 기록한다 */
function fakeFetch(handler: (path: string, q: URLSearchParams) => unknown) {
  const urls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    urls.push(u.pathname);
    const body = handler(u.pathname.replace("/1613000/", ""), u.searchParams);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { fetch: f, urls };
}

const item = (fields: Record<string, number>) => ({ response: { body: { item: { kaptCode: "B", kaptName: "동문디이스트", ...fields } } } });
const empty = { response: { body: {} } };

describe("KaptClient", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  const basisOf = (code: string, priv: number) => ({ response: { body: { item: { kaptCode: code, kaptName: `단지${code}`, privArea: String(priv), kaptdaCnt: 100 } } } });

  it("단지를 맞추면 세 달을 흩어 전용㎡당 단가를 낸다", async () => {
    // 2026-07이 최신(인건비 있음), 그 전 달들도 있음. 공용 17항목은 인건비 1,000만 원만, 나머지 0. 개별은 난방 200만 원.
    const { fetch, urls } = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return LIST_WITH_B;
      if (path.startsWith("AptBasisInfoServiceV5")) return basisOf("B", 10_000);
      const month = q.get("searchDate")!;
      if (month > "202607") return empty; // 신고 전
      if (path.endsWith("getHsmpLaborCostInfoV3")) return item({ pay: 10_000_000 });
      if (path.endsWith("getHsmpHeatCostInfoV3")) return item({ heatC: 500_000, heatP: 1_500_000 });
      return item({ x: 0 });
    });
    const info = await new KaptClient("k", fetch).forAnnouncement({ sigunguCode: "11500", district: "서울 강서구", title: "모집", address: "(염창역 동문디이스트)", now });
    expect(info).toMatchObject({ basis: "complex", complex: "단지B", kapt_code: "B", households: 100, common_per_m2: 1000, individual_per_m2: 200, months: ["2025-11", "2026-03", "2026-07"] });
    // 목록 1 + 기본 1 + 최신 달 탐색 1(두 달 전인 07부터 본다) + 3달 × 27
    expect(urls.length).toBe(1 + 1 + 1 + 3 * 27);
  });

  it("못 맞추면 같은 구 표본 단지의 공용 단가 중앙값 — 한 달, 공용만", async () => {
    const rows = ["P", "Q", "R", "S", "T"].map((c) => ({ kaptCode: c, kaptName: `단지${c}아파트`, bjdCode: "1150010100" }));
    const rates: Record<string, number> = { P: 900, Q: 1100, R: 1300, S: 700, T: 5000 };
    const { fetch, urls } = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return { response: { body: { items: rows, totalCount: 5 } } };
      if (path.startsWith("AptBasisInfoServiceV5")) return basisOf(q.get("kaptCode")!, 1000);
      if (path.endsWith("getHsmpLaborCostInfoV3")) return item({ pay: rates[q.get("kaptCode")!]! * 1000 });
      if (path.startsWith("AptIndvdlzManageCostServiceV3")) throw new Error("지역 평균은 개별사용료를 부르지 않는다");
      return item({ x: 0 });
    });
    const info = await new KaptClient("k", fetch).forAnnouncement({ sigunguCode: "11500", district: "서울 강서구", title: "신축 행복주택", now });
    expect(info).toMatchObject({ basis: "district", district: "서울 강서구", sample: 5, common_per_m2: 1100, months: ["2026-07"] });
    expect(info!.individual_per_m2).toBeUndefined();
    // 목록 1 + 5 × (기본 1 + 17) + 최신 달 탐색 1
    expect(urls.length).toBe(1 + 5 * 18 + 1);
  });

  it("공고 세대수를 알면 구 안의 모든 단지 기본정보를 받아 비슷한 크기로 고른다 — 캐시에 남는다", async () => {
    // 10단지, 세대수 100·200·…·1000. 공고 350세대 → 비율로 가까운 300·400·200·500·600 (|ln| 순)
    const rows = Array.from({ length: 10 }, (_, i) => ({ kaptCode: `C${i + 1}`, kaptName: `단지${i + 1}` }));
    const size: Record<string, number> = Object.fromEntries(rows.map((r, i) => [r.kaptCode, (i + 1) * 100]));
    const cache = new Map();
    const { fetch, urls } = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return { response: { body: { items: rows, totalCount: rows.length } } };
      if (path.startsWith("AptBasisInfoServiceV5")) {
        const code = q.get("kaptCode")!;
        return { response: { body: { item: { kaptCode: code, kaptName: `단지${code}`, privArea: "1000", kaptdaCnt: size[code] } } } };
      }
      if (path.endsWith("getHsmpLaborCostInfoV3")) return item({ pay: size[q.get("kaptCode")!]! * 1000 }); // 단가 = 세대수 (원/㎡)
      return item({ x: 0 });
    });
    const info = await new KaptClient("k", fetch, cache).forAnnouncement({ sigunguCode: "11500", district: "서울 강서구", title: "신축", households: 350, now });
    expect(info).toMatchObject({ basis: "district", sample: 5, sample_households: [200, 600], common_per_m2: 400 });
    // 기본정보는 10단지 모두 한 번씩만 (표본 5단지도 캐시에서 다시 읽는다) + 목록 1 + 최신 달 1 + 5 × 17
    expect(urls.filter((u) => u.includes("AptBasisInfoServiceV5")).length).toBe(10);
    expect(urls.length).toBe(1 + 10 + 1 + 5 * 17);
    expect(cache.size).toBe(10);

    // 두 번째 실행은 캐시로 기본정보 호출이 0
    const again = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return { response: { body: { items: rows, totalCount: rows.length } } };
      if (path.startsWith("AptBasisInfoServiceV5")) throw new Error("캐시가 있으면 기본정보를 다시 묻지 않는다");
      if (path.endsWith("getHsmpLaborCostInfoV3")) return item({ pay: size[q.get("kaptCode")!]! * 1000 });
      return item({ x: 0 });
    });
    await new KaptClient("k", again.fetch, cache).forAnnouncement({ sigunguCode: "11500", district: "서울 강서구", title: "신축", households: 350, now });
    expect(again.urls.filter((u) => u.includes("AptBasisInfoServiceV5")).length).toBe(0);
  });

  it("기본정보 예산이 모자라면 아는 단지 안에서 고른다", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ kaptCode: `C${i + 1}`, kaptName: `단지${i + 1}` }));
    const { fetch, urls } = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return { response: { body: { items: rows, totalCount: rows.length } } };
      if (path.startsWith("AptBasisInfoServiceV5")) return { response: { body: { item: { kaptCode: q.get("kaptCode"), kaptName: "x", privArea: "1000", kaptdaCnt: 300 } } } };
      if (path.endsWith("getHsmpLaborCostInfoV3")) return item({ pay: 1_000_000 });
      return item({ x: 0 });
    });
    const info = await new KaptClient("k", fetch, new Map()).forDistrict(rows.map((r) => ({ kapt_code: r.kaptCode, name: r.kaptName })), "서울 강서구", { households: 300, now, basisBudget: 4 });
    expect(info?.sample).toBe(4);
    expect(urls.filter((u) => u.includes("AptBasisInfoServiceV5")).length).toBe(4);
  });

  it("표본이 3단지가 안 되면 지역 평균을 내지 않는다", async () => {
    const { fetch } = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return { response: { body: { items: [{ kaptCode: "P", kaptName: "가" }, { kaptCode: "Q", kaptName: "나" }], totalCount: 2 } } };
      if (path.startsWith("AptBasisInfoServiceV5")) return basisOf(q.get("kaptCode")!, 1000);
      return item({ pay: 1000 });
    });
    expect(await new KaptClient("k", fetch).forAnnouncement({ sigunguCode: "11500", district: "서울 강서구", title: "x", now })).toBeNull();
  });

  it("구가 없는 코드(서울 전체)는 부르지 않는다", async () => {
    const { fetch, urls } = fakeFetch(() => empty);
    expect(await new KaptClient("k", fetch).forAnnouncement({ sigunguCode: "11000", district: "서울", title: "x", now })).toBeNull();
    expect(urls).toEqual([]);
  });

  it("포털 오류는 던진다 — XML도 JSON도. 오류를 '자료 없음'으로 캐시에 굳히지 않는다", async () => {
    const xml = (async () => new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>", { status: 200 })) as typeof fetch;
    await expect(new KaptClient("k", xml).listComplexes("11500")).rejects.toMatchObject({ code: "22", quotaExceeded: true });

    // 2026-09-24 실측: K-apt 서버 장애 때 JSON으로 온 오류
    const json = (async () => new Response(JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "HTTP_ERROR", returnAuthMsg: "HTTP 에러", returnReasonCode: "04" } } }), { status: 200 })) as typeof fetch;
    const cache = new Map();
    await expect(new KaptClient("k", json, cache).basis("A1")).rejects.toBeInstanceOf(KaptError);
    expect(cache.size).toBe(0);

    // 정상 껍데기의 NODATA(03)는 오류가 아니다 — 그 단지에 기본정보가 없다는 뜻이고, 그건 캐시한다
    const nodata = (async () => new Response(JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" }, body: {} } }), { status: 200 })) as typeof fetch;
    expect(await new KaptClient("k", nodata, cache).basis("A2")).toBeNull();
    expect(cache.get("A2")).toBeNull();
  });

  it("기본정보를 받는 도중 오류가 나면 아는 단지 안에서 고른다", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ kaptCode: `C${i + 1}`, kaptName: `단지${i + 1}` }));
    let basisCalls = 0;
    const { fetch } = fakeFetch((path, q) => {
      if (path.startsWith("AptListService4")) return { response: { body: { items: rows, totalCount: rows.length } } };
      if (path.startsWith("AptBasisInfoServiceV5")) {
        if (++basisCalls > 3) return { OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: "22" } } };
        return { response: { body: { item: { kaptCode: q.get("kaptCode"), kaptName: "x", privArea: "1000", kaptdaCnt: 300 } } } };
      }
      if (path.endsWith("getHsmpLaborCostInfoV3")) return item({ pay: 1_000_000 });
      return item({ x: 0 });
    });
    const info = await new KaptClient("k", fetch, new Map()).forAnnouncement({ sigunguCode: "11500", district: "서울 강서구", title: "x", households: 300, now });
    expect(info?.sample).toBe(3);
  });
});

const LIST_WITH_B = { response: { body: { items: [{ kaptCode: "A", kaptName: "염창현대2차아파트" }, { kaptCode: "B", kaptName: "동문디이스트" }], totalCount: 2 } } };
