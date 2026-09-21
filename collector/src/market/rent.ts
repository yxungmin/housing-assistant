/**
 * 국토교통부 전월세 실거래가 → 주변 시세 요약.
 *
 * 왜 붙이는가: 앱은 "보증금 5,712만 원"을 보여 주지만 그게 싼지 비싼지는 말해 주지 않는다.
 * 같은 법정동의 최근 실거래를 옆에 두면 사용자가 판단할 수 있다.
 *
 * 2026-09-21 확인 (공공데이터포털, 국가중점데이터·무료·자동승인, 개발계정 하루 10,000회):
 *   아파트      apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent
 *   연립다세대  .../RTMSDataSvcRHRent/getRTMSDataSvcRHRent
 *   오피스텔    .../RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent
 *   단독다가구  .../RTMSDataSvcSHRent/getRTMSDataSvcSHRent
 * 파라미터: serviceKey, LAWD_CD(법정동 코드 앞 5자리), DEAL_YMD(계약년월 6자리), pageNo, numOfRows. 응답은 XML.
 *
 * 필드명은 개편 전후가 섞여 있어(보증금액/deposit 등) 양쪽을 모두 읽는다.
 * 실제 응답으로 확인하기 전까지는 관대하게 파싱하고, 못 읽으면 조용히 건너뛴다 —
 * 시세는 있으면 좋은 정보이지 없으면 화면을 막을 정보가 아니다.
 *
 * 호출은 수집할 때 법정동·월 단위로 한 번씩만 한다. 사용자 수와 무관하다.
 */
const BASE = "https://apis.data.go.kr/1613000";

export type RentKind = "apt" | "rowhouse" | "officetel" | "detached";

const ENDPOINTS: Record<RentKind, string> = {
  apt: "RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
  rowhouse: "RTMSDataSvcRHRent/getRTMSDataSvcRHRent",
  officetel: "RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent",
  detached: "RTMSDataSvcSHRent/getRTMSDataSvcSHRent",
};

export interface RentDeal {
  kind: RentKind;
  /** 전용면적 ㎡ */
  area: number;
  /** 보증금 (원). 원본은 만 원 단위 문자열 */
  deposit: number;
  /** 월세 (원). 0이면 전세 */
  monthly_rent: number;
  /** YYYY-MM */
  month: string;
  building?: string;
}

/** 태그 하나를 뽑는다. 이름 후보를 순서대로 본다 (개편 전후 대응) */
function tag(xml: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    if (m?.[1] !== undefined) {
      const v = m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      if (v !== "") return v;
    }
  }
  return undefined;
}

/** "1,000" 같은 만 원 단위 문자열 → 원 */
const manwonToWon = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 10_000) : 0;
};

export function parseRentDeals(xml: string, kind: RentKind): RentDeal[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: RentDeal[] = [];
  for (const item of items) {
    const area = Number(tag(item, "excluUseAr", "전용면적") ?? "");
    const deposit = manwonToWon(tag(item, "deposit", "보증금액", "보증금"));
    if (!Number.isFinite(area) || area <= 0 || deposit <= 0) continue;
    const year = tag(item, "dealYear", "년");
    const month = tag(item, "dealMonth", "월");
    out.push({
      kind,
      area,
      deposit,
      monthly_rent: manwonToWon(tag(item, "monthlyRent", "월세금액", "월세")),
      month: year && month ? `${year}-${String(month).padStart(2, "0")}` : "",
      building: tag(item, "aptNm", "offiNm", "mhouseNm", "아파트", "연립다세대", "오피스텔"),
    });
  }
  return out;
}

export interface MarketRent {
  /** 법정동 코드 앞 5자리 */
  lawd_cd: string;
  /** 표본이 된 전용면적 구간 ㎡ */
  area_from: number;
  area_to: number;
  /** 조회한 기간 (YYYY-MM) */
  from: string;
  to: string;
  deals: number;
  /** 전세(월세 0) 보증금 중앙값 (원). 표본이 없으면 undefined */
  jeonse_median?: number;
  /** 월세 거래의 보증금·월세 중앙값 */
  monthly_deposit_median?: number;
  monthly_rent_median?: number;
  source: string;
}

const median = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

/** 최근 N개월의 YYYYMM 목록 (오늘 포함하지 않음 — 당월은 신고가 덜 쌓인다) */
export function recentMonths(count: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * 거래를 면적 구간으로 거르고 중앙값을 낸다.
 * 평균이 아니라 중앙값을 쓰는 이유: 실거래에는 한두 건의 이상치가 섞이고 표본이 작다.
 */
export function summarize(deals: RentDeal[], lawdCd: string, area: number, months: string[]): MarketRent {
  // 같은 평형대만 본다. 16㎡ 원룸을 84㎡ 거래와 비교하면 아무 의미가 없다.
  const from = area * 0.7;
  const to = area * 1.3;
  const inRange = deals.filter((d) => d.area >= from && d.area <= to);
  const jeonse = inRange.filter((d) => d.monthly_rent === 0).map((d) => d.deposit);
  const monthly = inRange.filter((d) => d.monthly_rent > 0);
  const sorted = [...months].sort();
  const ym = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  return {
    lawd_cd: lawdCd,
    area_from: Math.round(from * 10) / 10,
    area_to: Math.round(to * 10) / 10,
    from: ym(sorted[0] ?? ""),
    to: ym(sorted[sorted.length - 1] ?? ""),
    deals: inRange.length,
    jeonse_median: median(jeonse),
    monthly_deposit_median: median(monthly.map((d) => d.deposit)),
    monthly_rent_median: median(monthly.map((d) => d.monthly_rent)),
    source: "국토교통부 전월세 실거래가",
  };
}

/** 표본이 너무 적으면 보여 주지 않는다. 3건으로 "시세"라고 말하면 거짓말에 가깝다. */
export const MIN_DEALS = 5;
export const isUsable = (m: MarketRent): boolean => m.deals >= MIN_DEALS && m.jeonse_median !== undefined;

export class RentClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchMonth(kind: RentKind, lawdCd: string, dealYmd: string): Promise<RentDeal[]> {
    const url = `${BASE}/${ENDPOINTS[kind]}?serviceKey=${this.apiKey}&LAWD_CD=${encodeURIComponent(lawdCd)}&DEAL_YMD=${encodeURIComponent(dealYmd)}&numOfRows=1000&pageNo=1`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`실거래가 ${kind} HTTP ${res.status}`);
    return parseRentDeals(await res.text(), kind);
  }

  /**
   * 한 법정동의 최근 시세. 유형을 여러 개 받는 이유는 공공임대 단지가
   * 아파트일 수도 오피스텔·연립일 수도 있어서다. 실패한 유형은 건너뛴다.
   */
  async summary(lawdCd: string, area: number, kinds: RentKind[] = ["apt", "rowhouse", "officetel"], monthCount = 6): Promise<MarketRent> {
    const months = recentMonths(monthCount);
    const deals: RentDeal[] = [];
    for (const kind of kinds) {
      for (const ym of months) {
        try {
          deals.push(...(await this.fetchMonth(kind, lawdCd, ym)));
        } catch {
          // 한 유형·한 달이 비어도 나머지로 요약한다
        }
      }
    }
    return summarize(deals, lawdCd, area, months);
  }
}
