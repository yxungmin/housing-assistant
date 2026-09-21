/**
 * 마이홈포털 예비입주자 대기현황 → "조건은 맞는데 붙을까"에 답한다.
 *
 * 조건이 맞고 돈이 되면 마지막 질문이 "그래서 순번이 오나"다. 공고 목록만 모으는 앱은
 * 이 답을 가져올 수 없다. 단지·주택형별로 지금 몇 명이 기다리는지가 여기 있다.
 *
 * 2026-09-21 확인 (공공데이터포털, 무료·자동승인, 개발계정 하루 1,000회, JSON):
 *   apis.data.go.kr/1613000/HWSPR03/moveWaitStsList
 * 파라미터는 마이홈 웹과 같은 이름을 쓴다: brtcCode(시도), signguCode(시군구), suplyTy, houseTy, hsmpNm(단지명).
 *
 * 2026-09-21 공식 API 실응답으로 확인한 구조 (서울 3,778건):
 *   { response: { body: { totalCount, numOfRows, pageNo, item: [...] } } }   ← items로 한 겹 더 싸지 않는다
 *   item: rtsInsttNm 공급기관 · brtcNm 시도 · signguNm 시군구 · rnAdres 도로명주소 · hsmpSn 단지일련번호
 *         hsmpNm 단지명 · houseTyNm 주택유형 · suplyTyNm 공급유형 · styleNm 주택형 · drwtUnit 추첨단위
 *         waitCo 대기자 수 · trmnatCo 해지 수
 *   예: 관악산휴먼시아 3단지 50년임대 39형 — 대기 29명, 해지 10명.
 *
 * 마이홈 웹에는 있는 hshldCo(총세대수)·lastUpdtDt(기준일시)가 공식 API에는 없다.
 * 그래서 기준일은 우리가 받아온 시각으로 대신하고 화면에도 "기준"이 아니라 "확인"이라고 적는다.
 */
const BASE = "https://apis.data.go.kr/1613000/HWSPR03";

export interface WaitRow {
  /** 단지명 */
  complex: string;
  /** 공급기관 (LH서울, SH 등) */
  provider?: string;
  /** 공급유형명 (영구임대, 국민임대 …) */
  supply_type?: string;
  /** 주택형 표기. "039.12", "21형-영구"처럼 기관마다 형식이 다르다 */
  unit_type?: string;
  /** 총 세대수 */
  households?: number;
  /** 대기자 수 */
  waiting: number;
  /** 해지 수 (그만큼 자리가 났다는 뜻) */
  terminated?: number;
  /** 기준일 YYYY-MM-DD */
  as_of?: string;
  address?: string;
}

const num = (v: unknown): number | undefined => {
  // Number(null)·Number("")은 0이다. 값이 없는 것과 0을 구별해야 대기자 0명과 미제공이 안 섞인다.
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** "20260921020001" → "2026-09-21" */
export function parseAsOf(v: unknown): string | undefined {
  const s = String(v ?? "").replace(/[^0-9]/g, "");
  return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : undefined;
}

export function parseWaitRows(payload: unknown, fetchedAt?: string): WaitRow[] {
  // 공식 API는 response.body.item, 마이홈 웹은 resultList. items로 한 겹 더 싸는 형태도 대비해 둔다.
  const body = payload as { response?: { body?: { item?: unknown; items?: unknown } }; resultList?: unknown };
  const candidates = [body?.response?.body?.item, body?.response?.body?.items, body?.resultList];
  let list: unknown[] = [];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      list = c;
      break;
    }
    if (Array.isArray((c as { item?: unknown })?.item)) {
      list = (c as { item: unknown[] }).item;
      break;
    }
  }
  const out: WaitRow[] = [];
  for (const raw of list) {
    const r = raw as Record<string, unknown>;
    const complex = typeof r.hsmpNm === "string" ? r.hsmpNm.trim() : "";
    const waiting = num(r.waitCo);
    if (!complex || waiting === undefined) continue;
    out.push({
      complex,
      provider: typeof r.rtsInsttNm === "string" ? r.rtsInsttNm : undefined,
      supply_type: typeof r.suplyTyNm === "string" ? r.suplyTyNm : undefined,
      unit_type: typeof r.styleNm === "string" ? r.styleNm : undefined,
      households: num(r.hshldCo),
      waiting,
      terminated: num(r.trmnatCo),
      // 공식 API는 기준일을 주지 않는다. 받아온 시각으로 대신하고 화면은 "확인"이라고 말한다.
      as_of: parseAsOf(r.lastUpdtDt) ?? fetchedAt,
      address: typeof r.rnAdres === "string" ? r.rnAdres : undefined,
    });
  }
  return out;
}

export interface WaitSummary {
  /** 어떤 단지로 맞췄는가. 공고 제목과 단지명이 정확히 같지 않아서 남긴다 */
  complex: string;
  households?: number;
  /** 주택형별 대기자. 많은 순 */
  rows: { unit_type?: string; waiting: number; terminated?: number }[];
  /** 주택형을 통틀어 기다리는 사람 */
  total_waiting: number;
  as_of?: string;
  source: string;
}

/**
 * 마이홈의 시도 코드. 행정표준코드와 다른 것이 둘 있다 —
 * 강원은 42가 아니라 51(강원특별자치도), 전북은 45가 아니라 52(전북특별자치도)다.
 * 2026-09-21에 코드를 하나씩 던져 응답이 오는 것만 남겼다.
 */
const MYHOME_REGION: Record<string, string> = { "42": "51", "45": "52" };
export const myhomeRegionCode = (regionCode: string): string => MYHOME_REGION[regionCode] ?? regionCode;

/**
 * 단지 이름을 비교용으로 다듬는다.
 * 공고 제목은 "군산시 (군산나운4) 영구임대주택…"인데 대기현황 단지명은 "군산나운주공4단지"다.
 * 사업 주체·유형을 나타내는 상투어와 공백을 걷어내면 "군산나운4"로 같아진다.
 */
export function normalizeComplex(name: string): string {
  return name
    // 괄호는 기호만 없앤다. 내용을 지우면 안 된다 —
    // 공고 제목이 "군산시 (군산나운4) 영구임대주택…"처럼 괄호 안에 단지명을 넣는다.
    .replace(/[(（)）[]]/g, "")
    .replace(/주공|단지|휴먼시아|아파트|마을|타운|리츠|엘에이치|LH|SH/gi, "")
    .replace(/[^0-9A-Za-z가-힣]/g, "");
}

/**
 * 공고 제목·주소로 단지를 고른다.
 * 정확히 같은 이름이 오는 경우가 드물어 위 정규화를 거친 뒤 포함 관계를 본다.
 * 후보가 여럿이면 정규화 이름이 가장 긴 것을 고른다 — 더 구체적인 쪽이다.
 * 너무 짧은 이름(3자 미만)은 우연히 걸리므로 버린다. 남의 단지 숫자를 보여 주느니 안 보여 주는 게 낫다.
 */
export function matchComplex(rows: WaitRow[], title: string, address?: string): WaitRow[] {
  const hay = normalizeComplex(`${title} ${address ?? ""}`);
  const names = [...new Set(rows.map((r) => r.complex))]
    .map((n) => ({ raw: n, norm: normalizeComplex(n) }))
    .filter((n) => n.norm.length >= 3 && hay.includes(n.norm))
    .sort((a, b) => b.norm.length - a.norm.length);
  const chosen = names[0]?.raw;
  return chosen ? rows.filter((r) => r.complex === chosen) : [];
}

export function summarize(rows: WaitRow[]): WaitSummary | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.waiting - a.waiting);
  return {
    complex: sorted[0]!.complex,
    households: sorted[0]!.households,
    rows: sorted.map((r) => ({ unit_type: r.unit_type, waiting: r.waiting, terminated: r.terminated })),
    total_waiting: sorted.reduce((a, r) => a + r.waiting, 0),
    as_of: sorted[0]!.as_of,
    source: "마이홈포털 예비입주자 대기현황",
  };
}

export class WaitClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** 시도·시군구의 대기현황. 한 번에 다 받아 두고 단지명으로 맞춘다 */
  async list(brtcCode: string, signguCode?: string, rows = 5000): Promise<WaitRow[]> {
    const p = new URLSearchParams({ serviceKey: this.apiKey, brtcCode, numOfRows: String(rows), pageNo: "1", _type: "json" });
    if (signguCode) p.set("signguCode", signguCode);
    const res = await this.fetchImpl(`${BASE}/moveWaitStsList?${p.toString()}`);
    if (!res.ok) throw new Error(`대기현황 HTTP ${res.status}`);
    const text = await res.text();
    try {
      return parseWaitRows(JSON.parse(text), new Date().toISOString().slice(0, 10));
    } catch {
      // 키가 등록되지 않았을 때 XML 오류가 온다. 시세와 마찬가지로 없으면 그냥 넘어간다.
      return [];
    }
  }

  async forAnnouncement(brtcCode: string, title: string, address?: string): Promise<WaitSummary | null> {
    const rows = await this.list(myhomeRegionCode(brtcCode)).catch(() => []);
    return summarize(matchComplex(rows, title, address));
  }
}
