/**
 * K-apt(공동주택관리정보시스템) 관리비 → "관리비 얼마"에 답한다.
 *
 * 왜 붙이는가: 공고문에는 관리비가 거의 없다. 그동안 예상 주거비는 관리비를 10만 원으로 고정했는데,
 * 전용 26㎡와 59㎡가 같은 값일 리 없고 단지·지역에 따라 두 배쯤 차이가 난다.
 * K-apt에는 의무관리대상 단지(150세대 이상 등)가 매달 신고한 관리비가 항목별로 있다.
 *
 * 2026-09-24 실제 호출로 확인 (공공데이터포털 1613000, 활용신청 4건, JSON):
 *   단지 목록   AptListService4/getSigunguAptList4?sigunguCode=11500       → items[{kaptCode, kaptName, bjdCode, as1..as4}]
 *   단지 기본   AptBasisInfoServiceV5/getAphusBassInfoV5?kaptCode=…        → item{kaptdaCnt 세대수, privArea 전용면적합(문자열),
 *                                                                              kaptMarea 관리비부과면적, codeSaleNm 분양/임대, kaptUsedate}
 *   공용관리비  AptCmnuseManageCostServiceV3/getHsmp…CostInfoV3?kaptCode=…&searchDate=YYYYMM
 *               항목마다 오퍼레이션이 따로다(17개). 합계 오퍼레이션은 없다 — 항목 응답의 숫자 필드를 모두 더한다.
 *               예: 인건비 {pay, sundryCost, bonus, pension, …} · 청소비 {cleanCost}
 *   개별사용료  AptIndvdlzManageCostServiceV3/getHsmp…InfoV3 (10개). 난방 {heatC 공용, heatP 전용}처럼 나뉜 것도 다 더한다.
 *   예전 경로(1611000/*, AptListService3, V2·V4)는 errorCode 12(NO_OPENAPI_SERVICE_ERROR)로 죽어 있다.
 *
 * 단가는 **전용면적 1㎡당**으로 둔다: 단지 월 합계 ÷ 전용면적합(privArea).
 * 앱이 가진 것도 주택형의 전용면적이라 그대로 곱하면 된다. 부과면적(공급면적)으로 나누면
 * 전용→공급 비율을 짐작해야 하고, 그 짐작은 하지 않는다.
 *
 * 호출 예산 (개발계정 하루 1,000회):
 *   단지를 맞춘 공고 = 3개월 × 27항목 + 기본정보 1 + 목록 1 ≈ 83회
 *   못 맞춘 공고(신축이 대부분) = 같은 구 5단지 × (17항목 + 기본정보 1) + 목록 1 ≈ 91회 — 공용관리비만, 한 달만
 *   개별사용료(전기·난방·수도)는 계절을 타서 단지를 맞춘 경우에만 세 달을 흩어 잡고, 지역 평균에는 넣지 않는다.
 */
import { normalizeComplex } from "../wait/myhome";

const BASE = "https://apis.data.go.kr/1613000";

/** 공용관리비 17항목. 하나라도 빠지면 합계가 작아지므로 목록을 통째로 둔다 */
export const COMMON_OPS = [
  "getHsmpLaborCostInfoV3", // 인건비
  "getHsmpOfcrkCostInfoV3", // 제사무비
  "getHsmpTaxdueInfoV3", // 제세공과금
  "getHsmpClothingCostInfoV3", // 피복비
  "getHsmpEduTraingCostInfoV3", // 교육훈련비
  "getHsmpVhcleMntncCostInfoV3", // 차량유지비
  "getHsmpEtcCostInfoV3", // 그 밖의 부대비용
  "getHsmpCleaningCostInfoV3", // 청소비
  "getHsmpGuardCostInfoV3", // 경비비
  "getHsmpDisinfectionCostInfoV3", // 소독비
  "getHsmpElevatorMntncCostInfoV3", // 승강기유지비
  "getHsmpHomeNetworkMntncCostInfoV3", // 지능형 홈네트워크 설비 유지비
  "getHsmpRepairsCostInfoV3", // 수선비
  "getHsmpFacilityMntncCostInfoV3", // 시설유지비
  "getHsmpSafetyCheckUpCostInfoV3", // 안전점검비
  "getHsmpDisasterPreventionCostInfoV3", // 재해예방비
  "getHsmpConsignManageFeeInfoV3", // 위탁관리수수료
] as const;

/** 개별사용료 10항목 (관리비 고지서로 함께 걷는 사용료) */
export const INDIVIDUAL_OPS = [
  "getHsmpHeatCostInfoV3", // 난방
  "getHsmpHotWaterCostInfoV3", // 급탕
  "getHsmpGasRentalFeeInfoV3", // 가스
  "getHsmpElectricityCostInfoV3", // 전기
  "getHsmpWaterCostInfoV3", // 수도
  "getHsmpWaterPurifierTankFeeInfoV3", // 정화조오물수수료
  "getHsmpDomesticWasteFeeInfoV3", // 생활폐기물수수료
  "getHsmpBuildingInsuranceFeeInfoV3", // 건물보험료
  "getHsmpMovingInRepresentationMtgInfoV3", // 입주자대표회의운영비
  "getHsmpElectionOrpnsInfoV3", // 선거관리위원회운영비
] as const;

export interface KaptComplex {
  kapt_code: string;
  name: string;
  /** 법정동 코드 10자리 */
  bjd_code?: string;
}

export interface KaptBasis {
  kapt_code: string;
  name: string;
  households?: number;
  /** 전용면적 합 (㎡). 단가의 분모 */
  private_area_m2?: number;
  /** 관리비부과면적 (㎡). 참고용 */
  levy_area_m2?: number;
  /** "분양" / "임대" */
  sale_kind?: string;
  /** 사용승인일 YYYY-MM-DD */
  used_from?: string;
}

/** 수집기가 공고에 담는 값. 스키마(packages/schema Announcement.maintenance)와 같은 모양 */
export interface MaintenanceInfo {
  /** complex = 이 단지의 실제 신고값 · district = 같은 시군구 단지들의 평균 단가 */
  basis: "complex" | "district";
  complex?: string;
  kapt_code?: string;
  households?: number;
  /** basis가 district일 때 어디 평균인지 ("서울 강서구") */
  district?: string;
  /** 평균에 들어간 단지 수 */
  sample?: number;
  /** 표본 단지의 세대수 범위 [최소, 최대]. 공고 세대수와 비슷한 단지로 골랐을 때만 */
  sample_households?: [number, number];
  /** 공용관리비 단가 (원/전용㎡/월). 표본 달의 평균 */
  common_per_m2: number;
  /** 개별사용료 단가 (원/전용㎡/월). 단지를 맞춘 경우에만 */
  individual_per_m2?: number;
  /** 표본 달 (YYYY-MM). 화면이 "어느 달 기준"인지 밝힐 수 있게 */
  months: string[];
  source: string;
}

export const KAPT_SOURCE = "K-apt 공동주택관리정보시스템";

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "" || v === " ") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** 응답 껍데기에서 item 하나를 꺼낸다 (response.body.item). 목록은 items 배열이다 */
function bodyOf(payload: unknown): { item?: unknown; items?: unknown; totalCount?: unknown } | undefined {
  return (payload as { response?: { body?: { item?: unknown; items?: unknown; totalCount?: unknown } } })?.response?.body;
}

export function parseComplexList(payload: unknown): { rows: KaptComplex[]; total: number } {
  const body = bodyOf(payload);
  const raw = body?.items;
  const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as { item?: unknown })?.item) ? (raw as { item: unknown[] }).item : [];
  const rows: KaptComplex[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const code = typeof r.kaptCode === "string" ? r.kaptCode.trim() : "";
    const name = typeof r.kaptName === "string" ? r.kaptName.trim() : "";
    if (!code || !name) continue;
    rows.push({ kapt_code: code, name, bjd_code: typeof r.bjdCode === "string" ? r.bjdCode : undefined });
  }
  return { rows, total: num(body?.totalCount) ?? rows.length };
}

/** "20150806" → "2015-08-06" */
const ymd = (v: unknown): string | undefined => {
  const s = String(v ?? "").replace(/[^0-9]/g, "");
  return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : undefined;
};

export function parseBasis(payload: unknown): KaptBasis | null {
  const item = bodyOf(payload)?.item as Record<string, unknown> | undefined;
  if (!item || typeof item.kaptCode !== "string") return null;
  return {
    kapt_code: item.kaptCode,
    name: typeof item.kaptName === "string" ? item.kaptName.trim() : "",
    households: num(item.kaptdaCnt),
    // privArea는 문자열("9014.0338")로 온다. 0이면 없는 것과 같다 — 나눗셈의 분모다.
    private_area_m2: (num(item.privArea) ?? 0) > 0 ? num(item.privArea) : undefined,
    levy_area_m2: (num(item.kaptMarea) ?? 0) > 0 ? num(item.kaptMarea) : undefined,
    sale_kind: typeof item.codeSaleNm === "string" ? item.codeSaleNm.trim() : undefined,
    used_from: ymd(item.kaptUsedate),
  };
}

/**
 * 관리비 항목 응답 하나의 합계. 항목마다 필드명이 다르지만(pay·cleanCost·heatC…) 전부 금액이라
 * kaptCode·kaptName을 뺀 숫자 필드를 다 더한다. item이 없으면(그 달 신고 없음) undefined.
 */
export function sumCostItem(payload: unknown): number | undefined {
  const item = bodyOf(payload)?.item as Record<string, unknown> | undefined;
  if (!item) return undefined;
  let sum = 0;
  for (const [k, v] of Object.entries(item)) {
    if (k === "kaptCode" || k === "kaptName") continue;
    sum += num(v) ?? 0;
  }
  return sum;
}

/** "YYYYMM"에서 n달 전 */
export function shiftMonth(yyyymm: string, n: number): string {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4, 6)) - 1 - n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 오늘 기준 "YYYYMM" */
export const thisMonth = (now: Date = new Date()): string => `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

/** "202606" → "2026-06" */
export const monthLabel = (yyyymm: string): string => `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;

/**
 * 단지 이름으로 K-apt 단지를 고른다. 대기현황과 같은 정규화(normalizeComplex)를 쓴다.
 * 공급기관 단지명(complex) → 공고 제목 → 주소 순으로 붙여 하나의 건초더미를 만들고,
 * 정규화한 K-apt 이름이 그 안에 들어 있으면 후보다. 여럿이면 긴 이름(더 구체적인 쪽).
 * 4자 미만은 버린다 — "래미안"·"자이"는 어디에나 있다. 남의 단지 관리비를 보여 주느니 지역 평균이 낫다.
 */
export function matchKaptComplex(rows: KaptComplex[], keys: { complex?: string; title: string; address?: string }): KaptComplex | null {
  const hay = normalizeComplex(`${keys.complex ?? ""} ${keys.title} ${keys.address ?? ""}`);
  const candidates = rows
    .map((r) => ({ row: r, norm: normalizeComplex(r.name) }))
    .filter((c) => c.norm.length >= 4 && hay.includes(c.norm))
    .sort((a, b) => b.norm.length - a.norm.length);
  return candidates[0]?.row ?? null;
}

/**
 * 지역 평균의 표본 단지 — 공고 세대수를 모를 때의 예비 규칙.
 * 공공임대와 관리 방식이 비슷한 단지(임대·주공·휴먼시아 등)를 먼저 고르고 모자라면 목록 순서대로 채운다.
 * 이 규칙은 옛 주공 소단지로 쏠린다(008 실측: 등촌주공 넷, 2026-09-24). 세대수를 알면 아래 pickBySize를 쓴다.
 */
export function pickDistrictSample(rows: KaptComplex[], size = 5): KaptComplex[] {
  const rental = /임대|주공|휴먼시아|LH|SH|국민|행복|공공|엠밸리|천왕|마곡/i;
  const first = rows.filter((r) => rental.test(r.name));
  const rest = rows.filter((r) => !rental.test(r.name));
  return [...first, ...rest].slice(0, size);
}

/**
 * 공고 세대수와 비슷한 단지. 관리비 ㎡당 단가는 단지 크기에 가장 크게 좌우된다 —
 * 경비·청소·승강기는 세대가 나눠 내는 고정비라 소단지가 비싸고 대단지가 싸다.
 * 비율로 잰다(|ln(h/목표)|): 200세대 공고에 100세대와 400세대가 같은 거리다. 전용면적합이 없는 단지는 뺀다(분모다).
 */
export function pickBySize(candidates: KaptBasis[], households: number, size = 5): KaptBasis[] {
  return candidates
    .filter((b) => b.private_area_m2 && b.households && b.households > 0)
    .map((b) => ({ b, d: Math.abs(Math.log(b.households! / households)) }))
    .sort((x, y) => x.d - y.d || x.b.kapt_code.localeCompare(y.b.kapt_code))
    .slice(0, size)
    .map((x) => x.b);
}

/**
 * 단지 기본정보 캐시. 세대수·전용면적합은 바뀌지 않는 값인데 목록 API에는 없어서 단지마다 한 번 물어야 한다
 * (강서구 212단지 = 212회). 파일로 남겨 두면(collector/data/kapt-basis.json, 커밋) 구마다 한 번만 든다.
 * null은 "물어봤는데 없더라" — 다시 묻지 않는다.
 */
export type BasisCache = Map<string, KaptBasis | null>;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export class KaptError extends Error {
  constructor(
    message: string,
    readonly path: string,
    /** 공공데이터포털 returnReasonCode. 22 = 하루 한도 초과, 30 = 키 미등록 */
    readonly code?: string,
  ) {
    super(`K-apt ${message} — ${path}`);
  }
  /** 오늘은 더 불러도 소용없는 오류인가 */
  get quotaExceeded(): boolean {
    return this.code === "22";
  }
}

export class KaptClient {
  /** 이번 실행에서 부른 횟수. 하루 한도를 보며 돌린다 */
  calls = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    /** 단지 기본정보 캐시. 넘기면 여기서 먼저 찾고, 새로 받은 것은 여기 넣는다 (저장은 부르는 쪽이) */
    private readonly basisCache: BasisCache = new Map(),
    /**
     * 일시 오류(04 HTTP_ERROR·5xx) 재시도 간격. 한도 초과(22)·키 오류는 재시도하지 않는다.
     * 2026-09-24 실측: 연달아 70여 회 성공한 뒤 04가 오고 몇 분 지나면 다시 정상 — 장애라기보다 분당 제한에 가깝다.
     * 그래서 재시도 간격을 분 단위까지 늘리고(아래) 호출 사이에 쉼(paceMs)을 둔다.
     */
    private readonly retryDelaysMs: number[] = [3000, 10000, 30000, 60000],
    /** 호출 사이 쉼(ms). 300회를 쉼 없이 쏘면 04를 맞는다 */
    private readonly paceMs = 250,
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        if (this.paceMs > 0 && this.calls > 0) await new Promise((r) => setTimeout(r, this.paceMs));
        return await this.getOnce(path, params);
      } catch (e) {
        const transient = e instanceof KaptError && (e.code === "04" || /^HTTP 5/.test(e.message.replace(/^K-apt /, "")));
        const delay = this.retryDelaysMs[attempt];
        if (!transient || delay === undefined) throw e;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  /**
   * 한 번 부른다. 오류는 **던진다** — 조용히 null로 바꾸면 "그 달 신고 없음"·"기본정보 없음"과 구별이 안 된다.
   * 처음에 그렇게 했다가 한도 초과(XML 오류) 응답 24건을 "기본정보 없는 단지"로 캐시에 굳혔다(2026-09-24).
   * 공공데이터포털 오류는 HTTP 200에 XML로 온다(`<returnReasonCode>22</returnReasonCode>` = 하루 한도 초과).
   */
  private async getOnce(path: string, params: Record<string, string>): Promise<unknown> {
    const p = new URLSearchParams({ serviceKey: this.apiKey, _type: "json", ...params });
    this.calls++;
    const res = await this.fetchImpl(`${BASE}/${path}?${p.toString()}`);
    const text = await res.text();
    if (!res.ok) throw new KaptError(`HTTP ${res.status}`, path);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      const code = text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/)?.[1];
      const msg = text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>|<errMsg>([^<]+)<\/errMsg>/);
      throw new KaptError(`${msg?.[1] ?? msg?.[2] ?? "응답이 JSON이 아님"}${code ? ` (코드 ${code})` : ""}`, path, code);
    }
    // 같은 오류가 JSON으로도 온다: {"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnReasonCode":"04",…}}} (2026-09-24 실측, K-apt 서버 장애)
    const hdr = (payload as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; returnAuthMsg?: string; errMsg?: string } } })?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (hdr) throw new KaptError(`${hdr.returnAuthMsg ?? hdr.errMsg ?? "오류"} (코드 ${hdr.returnReasonCode ?? "?"})`, path, hdr.returnReasonCode);
    // 정상 응답의 header.resultCode. 00 정상, 03 NODATA(그 달 신고 없음·기본정보 없음 — 오류가 아니다), 나머지는 오류
    const rc = (payload as { response?: { header?: { resultCode?: string; resultMsg?: string } } })?.response?.header;
    if (rc?.resultCode && rc.resultCode !== "00" && rc.resultCode !== "03") throw new KaptError(`${rc.resultMsg ?? "오류"} (코드 ${rc.resultCode})`, path, rc.resultCode);
    return payload;
  }

  /** 시군구(법정동 앞 5자리)의 단지 전부 */
  async listComplexes(sigunguCode: string): Promise<KaptComplex[]> {
    const out: KaptComplex[] = [];
    for (let page = 1; page <= 5; page++) {
      const { rows, total } = parseComplexList(await this.get("AptListService4/getSigunguAptList4", { sigunguCode, pageNo: String(page), numOfRows: "1000" }));
      out.push(...rows);
      if (out.length >= total || rows.length === 0) break;
    }
    return out;
  }

  async basis(kaptCode: string): Promise<KaptBasis | null> {
    const cached = this.basisCache.get(kaptCode);
    if (cached !== undefined) return cached;
    const b = parseBasis(await this.get("AptBasisInfoServiceV5/getAphusBassInfoV5", { kaptCode }));
    this.basisCache.set(kaptCode, b);
    return b;
  }

  /** 한 달의 항목 합계. 모든 항목에 item이 없으면 undefined (신고 전인 달) */
  async monthTotal(kaptCode: string, month: string, ops: readonly string[], service: "AptCmnuseManageCostServiceV3" | "AptIndvdlzManageCostServiceV3"): Promise<number | undefined> {
    let sum = 0;
    let any = false;
    for (const op of ops) {
      const v = sumCostItem(await this.get(`${service}/${op}`, { kaptCode, searchDate: month }));
      if (v !== undefined) {
        any = true;
        sum += v;
      }
    }
    return any ? sum : undefined;
  }

  commonTotal = (kaptCode: string, month: string) => this.monthTotal(kaptCode, month, COMMON_OPS, "AptCmnuseManageCostServiceV3");
  individualTotal = (kaptCode: string, month: string) => this.monthTotal(kaptCode, month, INDIVIDUAL_OPS, "AptIndvdlzManageCostServiceV3");

  /**
   * 신고가 들어온 가장 최근 달. K-apt는 두 달쯤 늦게 채워진다.
   * 인건비 하나만 찔러 본다 — 어느 단지든 인건비는 0이 아니다.
   */
  async latestMonth(kaptCode: string, now: Date = new Date()): Promise<string | null> {
    for (let lag = 2; lag <= 6; lag++) {
      const month = shiftMonth(thisMonth(now), lag);
      const v = sumCostItem(await this.get("AptCmnuseManageCostServiceV3/getHsmpLaborCostInfoV3", { kaptCode, searchDate: month }));
      if (v !== undefined && v > 0) return month;
    }
    return null;
  }

  /**
   * 단지 하나의 실제 관리비. 최근 달과 4·8달 전 — 계절이 다른 세 달의 평균이다.
   * 개별사용료(난방·전기)는 여름·겨울이 두 배 차이라 한 달로는 말할 수 없다.
   */
  async forComplex(complex: KaptComplex, now: Date = new Date()): Promise<MaintenanceInfo | null> {
    const basis = await this.basis(complex.kapt_code);
    if (!basis?.private_area_m2) return null;
    const latest = await this.latestMonth(complex.kapt_code, now);
    if (!latest) return null;
    const months = [latest, shiftMonth(latest, 4), shiftMonth(latest, 8)];
    const common: number[] = [];
    const individual: number[] = [];
    const used: string[] = [];
    for (const m of months) {
      const c = await this.commonTotal(complex.kapt_code, m);
      if (c === undefined || c <= 0) continue;
      const i = await this.individualTotal(complex.kapt_code, m);
      common.push(c / basis.private_area_m2);
      if (i !== undefined && i > 0) individual.push(i / basis.private_area_m2);
      used.push(m);
    }
    if (common.length === 0) return null;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      basis: "complex",
      complex: basis.name || complex.name,
      kapt_code: complex.kapt_code,
      households: basis.households,
      common_per_m2: Math.round(avg(common)),
      individual_per_m2: individual.length ? Math.round(avg(individual)) : undefined,
      months: used.sort().map(monthLabel),
      source: KAPT_SOURCE,
    };
  }

  /**
   * 같은 시군구 단지들의 공용관리비 단가 중앙값. 단지를 못 맞춘 공고(대개 신축)에 쓴다.
   *
   * 공고 세대수(households)를 알면 세대수가 비슷한 단지를 고른다 — 단가를 가장 크게 가르는 것이 단지 크기다.
   * 그러려면 구 안의 모든 단지 기본정보가 필요한데(목록에는 세대수가 없다) 단지마다 1회라 캐시에 없는 것만
   * basisBudget까지 새로 묻는다. 예산이 모자라면 아는 단지 안에서 고른다 — 다음 실행이 이어서 채운다.
   * 세대수를 모르면 이름 규칙(pickDistrictSample)으로 돌아간다.
   * 3단지가 안 되면 null — 한두 단지로 "지역 평균"이라 하면 거짓이다.
   */
  async forDistrict(
    rows: KaptComplex[],
    district: string,
    opts: { households?: number; now?: Date; sampleSize?: number; basisBudget?: number } = {},
  ): Promise<MaintenanceInfo | null> {
    const { households, now = new Date(), sampleSize = 5, basisBudget = 250 } = opts;
    let sample: KaptComplex[];
    let bySize = false;
    if (households && households > 0) {
      let spent = 0;
      for (const c of rows) {
        if (this.basisCache.has(c.kapt_code)) continue;
        if (spent >= basisBudget) break;
        try {
          await this.basis(c.kapt_code);
        } catch (e) {
          // 한도 초과·서버 장애면 더 물어도 소용없다. 아는 단지 안에서 고르고, 관리비 호출이 계속 실패하면 거기서 던진다.
          if (e instanceof KaptError) break;
          throw e;
        }
        spent++;
      }
      const known = rows.map((c) => this.basisCache.get(c.kapt_code)).filter((b): b is KaptBasis => !!b);
      sample = pickBySize(known, households, sampleSize).map((b) => ({ kapt_code: b.kapt_code, name: b.name }));
      bySize = sample.length > 0;
    } else sample = pickDistrictSample(rows, sampleSize);

    const rates: number[] = [];
    const sizes: number[] = [];
    let month: string | null = null;
    for (const c of sample) {
      const basis = await this.basis(c.kapt_code);
      if (!basis?.private_area_m2) continue;
      // 달은 첫 단지에서 정하고 나머지에 같이 쓴다. 단지마다 찾으면 호출이 배로 든다.
      month ??= await this.latestMonth(c.kapt_code, now);
      if (!month) continue;
      const total = await this.commonTotal(c.kapt_code, month);
      if (total === undefined || total <= 0) continue;
      rates.push(total / basis.private_area_m2);
      if (basis.households) sizes.push(basis.households);
    }
    if (rates.length < 3 || !month) return null;
    return {
      basis: "district",
      district,
      sample: rates.length,
      sample_households: bySize && sizes.length === rates.length ? [Math.min(...sizes), Math.max(...sizes)] : undefined,
      common_per_m2: Math.round(median(rates)),
      months: [monthLabel(month)],
      source: KAPT_SOURCE,
    };
  }

  /**
   * 공고 하나의 관리비 정보. 단지를 맞추면 그 단지의 실제값, 못 맞추면 같은 구의 평균 단가.
   * sigunguCode는 법정동 코드 앞 5자리(지오코딩의 b_code). "1100000000"(서울 전체)처럼
   * 구가 없는 코드면 null — 서울 전체 평균은 어떤 집의 관리비도 아니다.
   */
  async forAnnouncement(input: {
    sigunguCode: string;
    district: string;
    title: string;
    complex?: string;
    address?: string;
    /** 공고 단지의 세대수 (LH 상세 HSH_CNT). 지역 표본을 비슷한 크기로 고르는 기준 */
    households?: number;
    now?: Date;
  }): Promise<MaintenanceInfo | null> {
    if (!/^\d{5}$/.test(input.sigunguCode) || input.sigunguCode.endsWith("000")) return null;
    const rows = await this.listComplexes(input.sigunguCode);
    if (rows.length === 0) return null;
    const hit = matchKaptComplex(rows, input);
    if (hit) {
      const info = await this.forComplex(hit, input.now);
      if (info) return info;
    }
    return this.forDistrict(rows, input.district, { households: input.households, now: input.now });
  }
}
