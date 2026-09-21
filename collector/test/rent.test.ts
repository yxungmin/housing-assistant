import { describe, expect, it } from "vitest";
import { isUsable, parseRentDeals, recentMonths, RentClient, summarize, type RentDeal } from "../src/market/rent";

/** 개편 후 필드명 (영문) */
const NEW_XML = `<response><body><items>
<item><sggCd>11110</sggCd><umdNm>갈현동</umdNm><aptNm>과천푸르지오</aptNm><excluUseAr>16.98</excluUseAr>
<dealYear>2026</dealYear><dealMonth>8</dealMonth><dealDay>12</dealDay><deposit>18,500</deposit><monthlyRent>0</monthlyRent></item>
<item><aptNm>과천자이</aptNm><excluUseAr>17.2</excluUseAr><dealYear>2026</dealYear><dealMonth>7</dealMonth>
<deposit>3,000</deposit><monthlyRent>65</monthlyRent></item>
<item><aptNm>큰평수</aptNm><excluUseAr>84.9</excluUseAr><dealYear>2026</dealYear><dealMonth>7</dealMonth>
<deposit>60,000</deposit><monthlyRent>0</monthlyRent></item>
</items></body></response>`;

/** 개편 전 필드명 (한글) */
const OLD_XML = `<response><body><items>
<item><아파트>옛이름</아파트><전용면적>16.5</전용면적><년>2026</년><월>6</월><보증금액>17,000</보증금액><월세금액>0</월세금액></item>
</items></body></response>`;

describe("parseRentDeals", () => {
  it("개편 후 영문 필드를 읽는다", () => {
    const deals = parseRentDeals(NEW_XML, "apt");
    expect(deals).toHaveLength(3);
    expect(deals[0]).toMatchObject({ area: 16.98, deposit: 185_000_000, monthly_rent: 0, month: "2026-08", building: "과천푸르지오" });
    expect(deals[1]!.monthly_rent).toBe(650_000);
  });

  it("개편 전 한글 필드도 읽는다", () => {
    const deals = parseRentDeals(OLD_XML, "apt");
    expect(deals[0]).toMatchObject({ area: 16.5, deposit: 170_000_000, monthly_rent: 0, building: "옛이름" });
  });

  it("면적이나 보증금이 없으면 버린다", () => {
    expect(parseRentDeals(`<items><item><excluUseAr>0</excluUseAr><deposit>100</deposit></item></items>`, "apt")).toEqual([]);
    expect(parseRentDeals(`<items><item><excluUseAr>20</excluUseAr><deposit>0</deposit></item></items>`, "apt")).toEqual([]);
  });

  it("빈 응답이나 오류 응답에도 터지지 않는다", () => {
    expect(parseRentDeals("", "apt")).toEqual([]);
    expect(parseRentDeals("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>키 없음</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", "apt")).toEqual([]);
  });
});

describe("summarize", () => {
  const deal = (area: number, deposit: number, rent = 0): RentDeal => ({ kind: "apt", area, deposit, monthly_rent: rent, month: "2026-08" });

  it("같은 평형대만 세고 중앙값을 낸다", () => {
    const deals = [deal(17, 100_000_000), deal(18, 200_000_000), deal(16, 300_000_000), deal(84, 900_000_000)];
    const m = summarize(deals, "41290", 17, ["202608"]);
    expect(m.deals).toBe(3); // 84㎡는 제외
    expect(m.jeonse_median).toBe(200_000_000);
  });

  it("면적 구간은 ±30%다", () => {
    const m = summarize([deal(17, 1)], "41290", 17, ["202608"]);
    expect(m.area_from).toBeCloseTo(11.9, 1);
    expect(m.area_to).toBeCloseTo(22.1, 1);
  });

  it("전세와 월세를 나눠 센다", () => {
    const m = summarize([deal(17, 100_000_000), deal(17, 30_000_000, 600_000), deal(17, 40_000_000, 800_000)], "41290", 17, ["202608"]);
    expect(m.jeonse_median).toBe(100_000_000);
    expect(m.monthly_deposit_median).toBe(35_000_000);
    expect(m.monthly_rent_median).toBe(700_000);
  });

  it("표본이 없으면 중앙값이 undefined", () => {
    const m = summarize([], "41290", 17, ["202608"]);
    expect(m.deals).toBe(0);
    expect(m.jeonse_median).toBeUndefined();
  });

  it("기간을 YYYY-MM으로 적는다", () => {
    const m = summarize([], "41290", 17, ["202603", "202608"]);
    expect(m.from).toBe("2026-03");
    expect(m.to).toBe("2026-08");
  });
});

describe("isUsable", () => {
  const base = { lawd_cd: "41290", area_from: 11, area_to: 22, from: "2026-03", to: "2026-08", source: "x" };

  it("표본이 적으면 쓰지 않는다 — 3건으로 시세라고 하면 거짓말이다", () => {
    expect(isUsable({ ...base, deals: 3, jeonse_median: 1 })).toBe(false);
    expect(isUsable({ ...base, deals: 5, jeonse_median: 1 })).toBe(true);
  });

  it("전세 중앙값이 없으면 쓰지 않는다", () => {
    expect(isUsable({ ...base, deals: 20 })).toBe(false);
  });
});

describe("recentMonths", () => {
  it("당월은 빼고 거슬러 올라간다 — 당월은 신고가 덜 쌓인다", () => {
    const months = recentMonths(3, new Date(2026, 8, 21)); // 2026-09
    expect(months).toEqual(["202608", "202607", "202606"]);
  });

  it("연을 넘어간다", () => {
    expect(recentMonths(2, new Date(2026, 0, 15))).toEqual(["202512", "202511"]);
  });
});

describe("RentClient", () => {
  it("법정동과 계약년월을 파라미터로 넣는다", async () => {
    let url = "";
    const fake: typeof fetch = async (u) => {
      url = String(u);
      return new Response(NEW_XML, { status: 200 });
    };
    await new RentClient("KEY", fake).fetchMonth("apt", "41290", "202608");
    expect(url).toContain("RTMSDataSvcAptRent/getRTMSDataSvcAptRent");
    expect(url).toContain("LAWD_CD=41290");
    expect(url).toContain("DEAL_YMD=202608");
  });

  it("한 유형이 실패해도 나머지로 요약한다", async () => {
    let calls = 0;
    const fake: typeof fetch = async () => {
      calls++;
      return calls % 2 === 0 ? new Response("", { status: 500 }) : new Response(NEW_XML, { status: 200 });
    };
    const m = await new RentClient("KEY", fake).summary("41290", 17, ["apt", "rowhouse"], 2);
    expect(m.deals).toBeGreaterThan(0);
  });
});
