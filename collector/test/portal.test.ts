import { describe, expect, it } from "vitest";
import { portalError, xmlTotalCount } from "../src/portal";

describe("portalError", () => {
  it("XML 오류 껍데기 — 한도 초과", () => {
    const e = portalError(
      "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
      "x",
    )!;
    expect(e.code).toBe("22");
    expect(e.quotaExceeded).toBe(true);
    expect(e.transient).toBe(false);
  });

  it("JSON 오류 껍데기 — K-apt 장애(04)는 일시 오류", () => {
    const e = portalError(JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "HTTP_ERROR", returnAuthMsg: "HTTP 에러", returnReasonCode: "04" } } }), "x")!;
    expect(e.code).toBe("04");
    expect(e.transient).toBe(true);
  });

  it("정상 응답과 자료 없음(03)은 오류가 아니다", () => {
    expect(portalError(JSON.stringify({ response: { header: { resultCode: "00" }, body: {} } }), "x")).toBeNull();
    expect(portalError(JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" }, body: {} } }), "x")).toBeNull();
    expect(portalError("<response><header><resultCode>000</resultCode></header><body><items/></body></response>", "x")).toBeNull();
    expect(portalError("<response><header><resultCode>03</resultCode></header></response>", "x")).toBeNull();
  });

  it("정상 XML의 다른 resultCode는 오류", () => {
    expect(portalError("<response><header><resultCode>99</resultCode><resultMsg>ERROR</resultMsg></header></response>", "x")?.code).toBe("99");
  });

  it("totalCount", () => {
    expect(xmlTotalCount("<response><body><totalCount>1234</totalCount></body></response>")).toBe(1234);
    expect(xmlTotalCount("<response/>")).toBeUndefined();
  });
});
