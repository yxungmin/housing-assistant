/**
 * LH 당첨 커트라인 — "지난 회차는 몇 순위에서 끝났나".
 *
 * 경쟁률을 찾아 헤매다 여기에 닿았다. 당첨자 발표의 "커트라인" 버튼이 xlsx 하나를 준다.
 * 그 안에 우리가 필요한 게 전부 들어 있다 (2026-09-22 실물 확인):
 *
 *   추첨단위 : 61130023 전북혁신 A10블럭   추첨회수 : 0069
 *   순번 | 추첨형 | 신청유형 | 공급호수 | 심사대상자수(총계·당첨·경쟁·낙첨) | 당첨커트라인 | 서류제출대상자커트라인
 *   1   | 29    | 예비자   | 30      | 216 · 22 · 11 · 183              | 1순위, 9점 당첨 | 1순위, 6점 심사
 *
 * 즉 경쟁률(216/30)과 마감 순위("1순위")를 **둘 다** 얻는다. 그리고 xlsx라
 * 기존 파서를 그대로 쓴다 — LLM이 필요 없다.
 *
 * **개인정보가 없다.** 명단 쪽에는 마스킹된 이름과 접수번호가 있지만 이 파일은 순수 집계다.
 * 그래서 명단은 건드리지 않고 이것만 가져온다 — 우리가 알 이유가 없는 것은 받지도 않는다.
 *
 * 화면에는 경쟁률보다 순위를 앞세울 생각이다. 공공임대는 순위제라
 * "7.2대 1"보다 "1순위에서 마감됐어요"가 내 순위와 직접 비교된다.
 */
import { readSheet } from "../xlsx";

const BASE = "https://apply.lh.or.kr/lhapply";
const UA = "Mozilla/5.0 (compatible; housing-assistant/0.1)";

export interface CutlineRow {
  /** 추첨형 (공고문의 주택형 코드) */
  draw_type?: string;
  /** 신청유형 — "당첨자" / "예비자" */
  applicant_kind?: string;
  /** 공급 호수 */
  households?: number;
  /** 심사대상자 수 (신청자) */
  applicants?: number;
  selected?: number;
  competing?: number;
  rejected?: number;
  /** "1순위, 9점" 원문 */
  win_cutline?: string;
  doc_cutline?: string;
  /** 마감 순위 (1·2·3…). 커트라인 문구에서 읽는다 */
  closed_rank?: number;
  /** 경쟁률. 공급 호수가 0이면 내지 않는다 */
  competition?: number;
}

export interface Cutline {
  /** 추첨단위 번호 + 단지명 */
  unit?: string;
  rows: CutlineRow[];
}

const num = (v: unknown): number | undefined => {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** "1순위, 9점  당첨 (1순위, 8점  경쟁)" → 1 */
export function rankOf(text: string | undefined): number | undefined {
  const m = /(\d+)\s*순위/.exec(text ?? "");
  return m ? Number(m[1]) : undefined;
}

/**
 * 커트라인 시트를 읽는다.
 *
 * 머리글이 두 줄로 쪼개져 있다(4행 "심사대상자수", 5행 "총계·당첨·경쟁·낙첨").
 * 열 이름으로 찾으려 들면 그 병합 때문에 어긋나므로, **숫자가 채워진 첫 줄부터**
 * 자리로 읽는다. 열 순서는 LH가 바꾸지 않는 한 고정이다.
 */
export function parseCutline(file: Buffer): Cutline {
  const rows = readSheet(file).map((r) => r.map((c) => String(c ?? "").trim()));
  const unit = rows.find((r) => r.some((c) => c.includes("추첨단위")))?.find((c) => c.includes("추첨단위"))?.replace(/^추첨단위\s*:\s*/, "");

  const out: CutlineRow[] = [];
  for (const r of rows) {
    const cells = r.filter((c) => c !== "");
    // 데이터 줄은 순번으로 시작하고 숫자가 여럿이다. 머리글 줄에는 "순번"·"총계" 같은 말이 있다
    if (cells.length < 8) continue;
    if (cells.some((c) => /순번|총계|커트라인/.test(c))) continue;
    if (!/^\d+$/.test(cells[0] ?? "")) continue;

    const [, draw_type, applicant_kind, households, applicants, selected, competing, rejected, win_cutline, doc_cutline] = cells;
    const hh = num(households);
    const ap = num(applicants);
    out.push({
      draw_type,
      applicant_kind,
      households: hh,
      applicants: ap,
      selected: num(selected),
      competing: num(competing),
      rejected: num(rejected),
      win_cutline,
      doc_cutline,
      closed_rank: rankOf(win_cutline),
      // 공급이 0이면 경쟁률이라는 말이 성립하지 않는다. 지어내지 않는다.
      competition: hh && ap && hh > 0 ? Math.round((ap / hh) * 10) / 10 : undefined,
    });
  }
  return { unit, rows: out };
}

/** 커트라인 팝업 HTML에서 첨부 파일 id */
export const cutlineFileId = (html: string): string | undefined =>
  /fileDownLoad\(['"]([^'"]+)['"]\)/.exec(html)?.[1];

export class LhCutlineClient {
  private cookie = "";
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async ensureSession(): Promise<void> {
    if (this.cookie) return;
    const res = await this.fetchImpl(`${BASE}/apply/pr/przwin/selectPrzwinAnnoRdList.do?mi=1248`, { headers: { "user-agent": UA } });
    this.cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "user-agent": UA, ...(this.cookie ? { cookie: this.cookie } : {}), ...extra };
  }

  /**
   * 한 추첨단위의 커트라인. 없으면 null —
   * 모든 공고에 커트라인이 붙지는 않는다 (선착순·잔여세대 등).
   */
  async fetch(unitNo: string, drawNo: string): Promise<Cutline | null> {
    await this.ensureSession();
    const pop = await this.fetchImpl(`${BASE}/apply/pr/przwin/przwinCutLinePop.do`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ mi: "1248", ltrNot: drawNo, ltrRslAhflDsCd: "02", ltrUntNo: unitNo }),
    });
    if (!pop.ok) return null;
    const fileId = cutlineFileId(await pop.text());
    if (!fileId) return null;

    const file = await this.fetchImpl(`${BASE}/lhFile.do?fileid=${encodeURIComponent(fileId)}`, { headers: this.headers() });
    if (!file.ok) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    // xlsx는 PK로 시작한다. HTML 오류 페이지를 시트로 읽으려 들면 엉뚱한 값이 나온다.
    if (buf.subarray(0, 2).toString() !== "PK") return null;
    return parseCutline(buf);
  }
}
