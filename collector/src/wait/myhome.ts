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
 * 응답 필드는 마이홈 웹의 같은 화면(selectMoveWaitStsList.do)에서 실측했다:
 *   hsmpNm 단지명 · rtsInsttNm 공급기관 · suplyTyNm 공급유형 · styleNm 주택형
 *   hshldCo 총세대수 · waitCo 대기자 수 · trmnatCo 해지 수 · lastUpdtDt 기준일시 · rnAdres 도로명주소
 * 예: 수서주공1단지 영구임대 039.12형 — 2,565세대에 대기 72명.
 *
 * 공식 API 응답도 같은 필드로 오리라 보지만 활용신청 전이라 실물로 확인하지 못했다.
 * 그래서 파서는 필드가 없거나 이름이 달라도 터지지 않고 빈 배열을 돌려준다.
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

export function parseWaitRows(payload: unknown): WaitRow[] {
  const body = (payload as { response?: { body?: { items?: unknown } } })?.response?.body?.items ?? (payload as { resultList?: unknown })?.resultList;
  const list = Array.isArray(body) ? body : Array.isArray((body as { item?: unknown })?.item) ? (body as { item: unknown[] }).item : [];
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
      as_of: parseAsOf(r.lastUpdtDt),
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
 * 공고 제목·주소로 단지를 고른다.
 * 정확히 일치하는 이름이 없을 때가 많아(공고 제목은 "과천지식정보타운 S-11BL 행복주택(리츠) 입주자 모집공고")
 * 단지명이 제목 안에 들어 있는지를 본다. 후보가 여럿이면 가장 긴 이름을 고른다 — 더 구체적인 쪽이다.
 */
export function matchComplex(rows: WaitRow[], title: string, address?: string): WaitRow[] {
  const hay = `${title} ${address ?? ""}`.replace(/\s+/g, "");
  const names = [...new Set(rows.map((r) => r.complex))]
    .filter((n) => n.length >= 3 && hay.includes(n.replace(/\s+/g, "")))
    .sort((a, b) => b.length - a.length);
  const chosen = names[0];
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
  async list(brtcCode: string, signguCode?: string, rows = 500): Promise<WaitRow[]> {
    const p = new URLSearchParams({ serviceKey: this.apiKey, brtcCode, numOfRows: String(rows), pageNo: "1", _type: "json" });
    if (signguCode) p.set("signguCode", signguCode);
    const res = await this.fetchImpl(`${BASE}/moveWaitStsList?${p.toString()}`);
    if (!res.ok) throw new Error(`대기현황 HTTP ${res.status}`);
    const text = await res.text();
    try {
      return parseWaitRows(JSON.parse(text));
    } catch {
      // 키가 등록되지 않았을 때 XML 오류가 온다. 시세와 마찬가지로 없으면 그냥 넘어간다.
      return [];
    }
  }

  async forAnnouncement(brtcCode: string, title: string, address?: string): Promise<WaitSummary | null> {
    const rows = await this.list(brtcCode).catch(() => []);
    return summarize(matchComplex(rows, title, address));
  }
}
