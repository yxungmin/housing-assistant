/**
 * 공공데이터포털(apis.data.go.kr) 공통 오류 껍데기.
 *
 * 포털은 오류를 HTTP 200으로 준다. 모양은 둘이다:
 *   XML  <OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode>…
 *   JSON {"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnReasonCode":"04",…}}}   (K-apt 장애 때 실측, 2026-09-24)
 * 정상 응답의 header.resultCode도 본다 — 00 정상, 03 NODATA(자료 없음, 오류가 아니다).
 *
 * 한 곳에 두는 이유: 시세(rent.ts)·대기현황(myhome.ts)·관리비(kapt.ts)가 각자 파싱하다가
 * 오류를 "자료 없음"으로 삼켰다. 한도 초과(22)를 빈 표본으로 저장하면 그 공고는 영영 시세가 없다.
 */
export class PortalError extends Error {
  constructor(
    message: string,
    readonly path: string,
    /** returnReasonCode. 04 HTTP_ERROR(일시) · 22 하루 한도 초과 · 30 키 미등록 · 31 기한 만료 · 12 서비스 없음 */
    readonly code?: string,
  ) {
    super(`포털 ${message} — ${path}`);
  }
  /** 오늘은 더 불러도 소용없는 오류인가 */
  get quotaExceeded(): boolean {
    return this.code === "22";
  }
  /** 잠시 뒤 다시 부르면 될 수 있는 오류인가 */
  get transient(): boolean {
    return this.code === "04" || /^포털 HTTP 5/.test(this.message);
  }
}

/** 응답 본문이 포털 오류면 PortalError, 아니면 null. 정상 응답(자료 없음 포함)은 null */
export function portalError(text: string, path: string): PortalError | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    if (!/<OpenAPI_ServiceResponse|<cmmMsgHeader/.test(text)) {
      // 정상 XML의 resultCode
      const rc = text.match(/<resultCode>\s*(\d+)\s*<\/resultCode>/)?.[1];
      if (rc && rc !== "00" && rc !== "000" && rc !== "03") return new PortalError(`${text.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1]?.trim() ?? "오류"} (코드 ${rc})`, path, rc);
      return null;
    }
    const code = text.match(/<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/)?.[1];
    const msg = text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)?.[1] ?? text.match(/<errMsg>([^<]+)<\/errMsg>/)?.[1];
    return new PortalError(`${msg?.trim() ?? "오류"}${code ? ` (코드 ${code})` : ""}`, path, code);
  }
  try {
    const payload = JSON.parse(text) as {
      OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; returnAuthMsg?: string; errMsg?: string } };
      response?: { header?: { resultCode?: string; resultMsg?: string } };
    };
    const hdr = payload?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (hdr) return new PortalError(`${hdr.returnAuthMsg ?? hdr.errMsg ?? "오류"} (코드 ${hdr.returnReasonCode ?? "?"})`, path, hdr.returnReasonCode);
    const rc = payload?.response?.header;
    if (rc?.resultCode && rc.resultCode !== "00" && rc.resultCode !== "03") return new PortalError(`${rc.resultMsg ?? "오류"} (코드 ${rc.resultCode})`, path, rc.resultCode);
    return null;
  } catch {
    // JSON도 XML도 아니다 — 응답 자체가 이상하다
    return new PortalError("응답을 읽을 수 없음", path);
  }
}

/** XML 응답의 totalCount. 없으면 undefined */
export const xmlTotalCount = (xml: string): number | undefined => {
  const n = Number(xml.match(/<totalCount>\s*(\d+)\s*<\/totalCount>/)?.[1]);
  return Number.isFinite(n) ? n : undefined;
};
