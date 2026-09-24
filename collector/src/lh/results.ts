/**
 * LH 당첨자 발표 목록 — "지난번엔 어디까지 갔나"에 답한다.
 *
 * 경쟁률을 찾다가 여기까지 왔다. 공공임대 경쟁률은 공개 API가 없고(2026-09-22 조사, TODO 참고),
 * 있더라도 순위제라 당락을 잘 설명하지 못한다. 대신 청약플러스의 당첨자 발표에는
 * **예비자 총원**과 **커트라인**이 있다. "예비 30번까지 갔다"가 "경쟁률 3:1"보다 직접적이다.
 *
 * 되돌아본 것 (2026-09-22, 브라우저로 실제 요청을 관찰해서 알아냈다):
 *  - 목록은 페이지를 열 때가 아니라 **검색을 눌러야** 나온다. 빠진 파라미터는 `srchRes=Y` 하나였다.
 *  - 응답 HTML 안에 `list.push({ ... })` 형태로 구조화된 행이 그대로 박혀 있다. 표를 파싱할 필요가 없다.
 *  - **`panId`가 LH 공개 API의 PAN_ID와 같은 값이다.** 그래서 우리 공고와 그냥 이어 붙는다.
 *  - 세션 쿠키가 필요하다. 먼저 GET으로 한 번 받고 그 쿠키로 POST 한다.
 *
 * LLM을 쓰지 않는다. 정규식과 문자열 파싱뿐이다.
 *
 * **개인정보**: 명단에는 마스킹된 이름과 접수번호가 있다. 우리는 **집계만** 가져온다 —
 * 예비자 수와 커트라인. 개인 행은 읽지도 저장하지도 않는다. 우리가 알 이유가 없다.
 */
const BASE = "https://apply.lh.or.kr/lhapply/apply/pr/przwin";
const LIST = `${BASE}/selectPrzwinAnnoRdList.do`;
const UA = "Mozilla/5.0 (compatible; housing-assistant/0.1)";

export interface ResultNotice {
  /** LH PAN_ID — 모집공고와 잇는 열쇠 */
  pan_id: string;
  title: string;
  /** 당첨자 발표일 (YYYY-MM-DD) */
  announced_at?: string;
  /** 06 임대주택, 13 주거복지, 05 분양주택, 01 토지 … */
  upper_type?: string;
  type_code?: string;
  /** 당첨자 명단이 있는가 */
  has_winners: boolean;
  /** 예비자 명단이 있는가 */
  has_reserves: boolean;
  /** 추첨단위 번호. 커트라인을 받을 때와 같은 단지의 다른 회차를 찾을 때 쓴다 */
  unit_no?: string;
  /** 추첨회수 */
  draw_no?: string;
}

/**
 * LH가 XSS 필터로 바꿔 둔 토큰을 되돌린다.
 * 공고명에 작은따옴표가 흔하다 — "모집 공고('26.05.15.)" 같은 표기.
 * 안 되돌리면 제목에 `[sgQtRp]`가 그대로 박혀 사용자 화면까지 간다.
 */
const unescapeLh = (s: string): string =>
  s
    .replace(/\[sgQtRp\]/g, "'")
    .replace(/\[dbQtRp\]/g, '"')
    .replace(/\[ltRp\]/g, "<")
    .replace(/\[gtRp\]/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** `list.push({ a : '1', b : '2' });` 한 덩이를 객체로 */
function parseEntries(html: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of html.matchAll(/list\.push\(\{([\s\S]*?)\}\);/g)) {
    const o: Record<string, string> = {};
    for (const f of m[1]!.matchAll(/(\w+)\s*:\s*'([^']*)'/g)) o[f[1]!] = unescapeLh(f[2]!);
    if (o.panId) out.push(o);
  }
  return out;
}

const toDate = (s?: string): string | undefined => (s && /^\d{4}\.\d{2}\.\d{2}$/.test(s) ? s.replace(/\./g, "-") : undefined);

/** 임대·주거복지만. 토지·상가는 우리 공고가 아니다 */
const HOUSING_TYPES = new Set(["05", "06", "13", "39"]);

export class LhResultClient {
  private cookie = "";
  constructor(private readonly fetchImpl: typeof fetch = resilientFetch()) {}

  /** 세션 쿠키를 받아 둔다. 없으면 POST가 빈 목록을 준다 */
  private async ensureSession(): Promise<void> {
    if (this.cookie) return;
    const res = await this.fetchImpl(`${LIST}?mi=1248`, { headers: { "user-agent": UA } });
    const raw = res.headers.getSetCookie?.() ?? [];
    this.cookie = raw.map((c) => c.split(";")[0]).join("; ");
  }

  /** 당첨자 발표 한 페이지. `perPage`는 15·30·50·100만 받는다 */
  async page(page = 1, perPage: 15 | 30 | 50 | 100 = 100): Promise<ResultNotice[]> {
    await this.ensureSession();
    const body = new URLSearchParams({
      mi: "1248",
      srchRes: "Y", // ← 이게 없으면 목록이 비어서 온다. 알아내는 데 제일 오래 걸렸다
      currPage: String(page),
      listCo: String(perPage),
      mainCurrPage: String(page),
      minSn: String((page - 1) * perPage),
      maxSn: String(page * perPage),
      xssChk: "N",
      indVal: "N",
      jobAt: "N",
    });
    const res = await this.fetchImpl(LIST, {
      method: "POST",
      headers: {
        "user-agent": UA,
        "content-type": "application/x-www-form-urlencoded",
        referer: `${LIST}?mi=1248`,
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body,
    });
    if (!res.ok) throw new Error(`LH 당첨자발표 목록 HTTP ${res.status}`);
    return parseEntries(await res.text())
      .filter((e) => HOUSING_TYPES.has(e.uppAisTpCd ?? ""))
      .map((e) => ({
        pan_id: e.panId!,
        title: e.panNm ?? "",
        announced_at: toDate(e.pzwrAncDt),
        upper_type: e.uppAisTpCd,
        type_code: e.aisTpCd,
        has_winners: !!e.pzwrBtn1,
        has_reserves: !!e.pzwrBtn2,
        unit_no: e.ltrUntNo || undefined,
        draw_no: e.ltrToyNo || e.ltrNot || undefined,
      }));
  }

  /** 여러 페이지. 같은 공고가 단지별로 여러 줄 오므로 pan_id로 합친다 */
  async recent(pages = 3): Promise<ResultNotice[]> {
    const seen = new Map<string, ResultNotice>();
    for (let p = 1; p <= pages; p++) {
      const rows = await this.page(p);
      if (rows.length === 0) break;
      for (const r of rows) {
        // 한 공고에 단지가 여럿이면 명단 유무를 합친다 — 하나라도 있으면 있는 것이다
        // 같은 공고라도 단지(추첨단위)가 다르면 별개 결과다. 단지별로 남긴다.
        const key = `${r.pan_id}:${r.unit_no ?? ""}`;
        const cur = seen.get(key);
        seen.set(key, cur ? { ...cur, has_winners: cur.has_winners || r.has_winners, has_reserves: cur.has_reserves || r.has_reserves } : r);
      }
    }
    return [...seen.values()];
  }
}

export { parseEntries };
import { resilientFetch } from "../http";
