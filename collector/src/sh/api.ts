import type { HousingType } from "@housing/schema";
import { mapHousingType } from "../lh/mapping";

/**
 * SH 서울주택도시개발공사 공고 수집기.
 *
 * SH는 공개 API가 없다 (2026-09-21 확인):
 *  - 공공데이터포털: SH 오픈 API 0건 (자치구별 임대주택 현황 등 통계 파일데이터만)
 *  - 서울 열린데이터광장: SH 6건 모두 통계·공급계획
 *  - 국토부 마이홈포털 통합 API: SH 미포함 (최근 300건 표본에서 LH 281 + 지방 도시공사 19, SH 0건.
 *    서울 지역 179건도 전부 LH. 미리내집·희망하우징·청년안심주택 검색 0건)
 *  - SH 홈페이지: RSS·JSON 없음, 별도 청약 도메인 없음
 * 따라서 게시판 HTML을 파싱한다. 구조가 바뀌면 파서가 깨지므로 수집 실패를 반드시 로그로 남긴다.
 *
 * 2026-09-21 실제 응답으로 확인한 구조:
 *  - 목록: /main/lay2/program/S1T294C297/www/brd/m_247/list.do
 *      multi_itm_seq=2(주택임대), notType1=2, isRecrnoti=Y(모집공고만), srchFr/srchTo(등록일 범위), page=N
 *      한 페이지 10건. 총 건수는 `<div class="mentcount">총 <strong>23</strong> 건 [1/3페이지]</div>`
 *      행: <td>번호</td><td class="txtL"><a onclick="getDetailView('310258')">제목</a></td>
 *          <td>부서</td><td class="num">등록일</td><td class="num">조회수</td>
 *  - 상세: view.do?multi_itm_seq=2&seq=<seq>
 *      첨부 목록이 스크립트 안에 JSON으로 들어 있다:
 *      initParam.downList = [{"brdId":"GS0401","seq":"310258","fileSeq":"1","fileSize":"576473",
 *                            "oriFileNm":"...모집공고(2026_ 9_ 17_).pdf","fileTp":"A"}, ...]
 *  - 다운로드: /main/com/file/innoFD.do?brdId=GS0401&seq=<seq>&fileTp=A&fileSeq=<1-based>
 *      Content-Type은 application/octet-stream이고 본문은 %PDF-로 시작한다.
 */
const BASE = "https://www.i-sh.co.kr";
const LIST_PATH = "/main/lay2/program/S1T294C297/www/brd/m_247/list.do";
const VIEW_PATH = "/main/lay2/program/S1T294C297/www/brd/m_247/view.do";
const FILE_PATH = "/main/com/file/innoFD.do";
const PAGE_SIZE = 10;

/** SH 공고는 모두 서울이다 */
export const SH_REGION_CODE = "11";
export const SH_REGION_NAME = "서울";

/** 게시판의 주택임대 공급유형 코드. 목록을 유형별로 좁힐 때 쓴다 (기본 수집은 전체). */
export const SH_SUPPLY_TYPES: { code: string; name: string }[] = [
  { code: "02", name: "국민공공임대주택" },
  { code: "03", name: "장기전세주택" },
  { code: "04", name: "매입임대주택" },
  { code: "05", name: "장기안심주택" },
  { code: "06", name: "희망하우징" },
  { code: "07", name: "행복주택" },
  { code: "10", name: "청년안심주택" },
  { code: "11", name: "두레주택" },
  { code: "12", name: "사회주택" },
  { code: "13", name: "도시형생활주택" },
  { code: "14", name: "수요자맞춤형" },
  { code: "20", name: "전세임대" },
  { code: "22", name: "영구임대주택" },
  { code: "23", name: "재개발임대주택" },
];

export interface ShNoticeSummary {
  /** 게시판 seq */
  sh_id: string;
  title: string;
  housing_type: HousingType;
  /** 유형 판정에 쓴 문자열 (제목 또는 공급유형명) */
  housing_type_raw: string;
  region_code: string;
  region_name: string;
  /** 등록일 YYYY-MM-DD. 공고일은 공고문에서 다시 읽는다 */
  notice_date?: string;
  department?: string;
  detail_url: string;
  /** 제목에 (수정)·정정 표기가 있으면 true */
  corrected: boolean;
  unknown_codes: string[];
}

export interface ShAttachment {
  brd_id: string;
  seq: string;
  file_seq: string;
  file_tp: string;
  name: string;
  size: number;
  url: string;
}

export interface ShNoticeDetail {
  attachments: ShAttachment[];
  /**
   * 수정 탐지 키. SH는 수정일시를 주지 않으므로 첨부의 (순번:크기)를 합쳐 쓴다.
   * 공고문 파일이 교체되면 크기가 달라져 재추출 대상이 된다.
   */
  content_key: string;
  raw_html_chars: number;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, " ");

const text = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** 목록 HTML → 공고 요약. 유형은 제목으로 판정한다 (게시판 행에 유형 코드가 없다). */
export function parseNoticeList(html: string, supplyTypeName?: string): ShNoticeSummary[] {
  const tableStart = html.indexOf('<div id="listTb"');
  const scope = tableStart >= 0 ? html.slice(tableStart) : html;
  const bodyStart = scope.indexOf("<tbody");
  if (bodyStart < 0) return [];
  const body = scope.slice(bodyStart, scope.indexOf("</tbody>") + 8);
  const rows = body.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const out: ShNoticeSummary[] = [];
  for (const row of rows) {
    const seq = row.match(/getDetailView\('(\d+)'\)/)?.[1];
    if (!seq) continue;
    const titleHtml = row.match(/getDetailView\('\d+'\);return false;"\s*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    const title = text(titleHtml);
    if (!title) continue;
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map(text);
    const notice_date = cells.find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c));
    const department = cells.find((c) => /부$|팀$|과$/.test(c));
    const mapped = mapHousingType(supplyTypeName, title);
    out.push({
      sh_id: seq,
      title,
      housing_type: mapped.housing_type,
      housing_type_raw: supplyTypeName ?? title,
      region_code: SH_REGION_CODE,
      region_name: SH_REGION_NAME,
      notice_date,
      department,
      detail_url: `${BASE}${VIEW_PATH}?multi_itm_seq=2&seq=${seq}`,
      corrected: /\(\s*수정\s*\)|정정/.test(title),
      unknown_codes: mapped.unknown ? [`sh_housing_type:${mapped.unknown}`] : [],
    });
  }
  return out;
}

/** 목록 HTML에서 총 건수를 읽는다 (`총 23 건 [1/3페이지]`). */
export function parseTotalCount(html: string): number {
  const m = html.match(/총\s*<strong[^>]*>\s*([\d,]+)\s*<\/strong>\s*건/);
  return m ? Number(m[1]!.replace(/,/g, "")) : 0;
}

/** 상세 HTML → 첨부 목록. 스크립트의 initParam.downList JSON을 읽는다. */
export function parseNoticeDetail(html: string): ShNoticeDetail {
  const m = html.match(/initParam\.downList\s*=\s*(\[[\s\S]*?\]);/);
  let attachments: ShAttachment[] = [];
  if (m?.[1]) {
    try {
      const raw = JSON.parse(m[1]) as { brdId: string; seq: string; fileSeq: string; fileSize: string; oriFileNm: string; fileTp: string }[];
      attachments = raw.map((f) => ({
        brd_id: f.brdId,
        seq: f.seq,
        file_seq: f.fileSeq,
        file_tp: f.fileTp,
        name: f.oriFileNm,
        size: Number(f.fileSize) || 0,
        url: `${BASE}${FILE_PATH}?brdId=${encodeURIComponent(f.brdId)}&seq=${encodeURIComponent(f.seq)}&fileTp=${encodeURIComponent(f.fileTp)}&fileSeq=${encodeURIComponent(f.fileSeq)}`,
      }));
    } catch {
      attachments = [];
    }
  }
  return {
    attachments,
    content_key: attachments.map((a) => `${a.file_seq}:${a.size}`).join(","),
    raw_html_chars: html.length,
  };
}

/**
 * 첨부 중 모집공고문 PDF 하나.
 * SH는 공고문 외에 신청서·유의사항·평면도도 함께 올리므로 이름으로 고른다.
 * 1순위 "모집공고문", 2순위 "공고", 3순위 가장 큰 PDF (공고문이 보통 가장 두껍다).
 */
export function pickNoticePdf(attachments: ShAttachment[]): ShAttachment | undefined {
  const pdfs = attachments.filter((a) => /\.pdf$/i.test(a.name));
  if (pdfs.length === 0) return undefined;
  return (
    pdfs.find((a) => /모집\s*공고문/.test(a.name)) ??
    pdfs.find((a) => /모집\s*공고/.test(a.name)) ??
    pdfs.find((a) => /공고문/.test(a.name)) ??
    [...pdfs].sort((a, b) => b.size - a.size)[0]
  );
}

const dash = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface ShListOptions {
  page?: number;
  /** 등록일 범위 시작. 기본 90일 전 */
  from?: Date;
  /** 등록일 범위 끝. 기본 오늘 */
  to?: Date;
  /** 공급유형 코드 (SH_SUPPLY_TYPES). 없으면 전체 */
  supplyType?: string;
}

export class ShClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async get(url: string): Promise<string> {
    const res = await this.fetchImpl(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; housing-assistant/0.1)", referer: BASE } });
    if (!res.ok) throw new Error(`SH ${url} HTTP ${res.status}`);
    return res.text();
  }

  listUrl(opts: ShListOptions = {}): string {
    const from = opts.from ?? new Date(Date.now() - 90 * 86_400_000);
    const to = opts.to ?? new Date();
    const p = new URLSearchParams({
      multi_itm_seq: "2",
      notType1: "2",
      isRecrnoti: "Y",
      srchFr: dash(from),
      srchTo: dash(to),
      page: String(opts.page ?? 1),
    });
    if (opts.supplyType) p.set("splyTy", opts.supplyType);
    return `${BASE}${LIST_PATH}?${p.toString()}`;
  }

  /** 모집공고 목록 한 페이지 (원본 HTML) */
  async listNoticesHtml(opts: ShListOptions = {}): Promise<string> {
    return this.get(this.listUrl(opts));
  }

  /** 기간 안의 모집공고 전체. 한 페이지 10건씩 끝까지 넘긴다. */
  async listAllRentalNotices(opts: Omit<ShListOptions, "page"> = {}): Promise<ShNoticeSummary[]> {
    const first = await this.listNoticesHtml({ ...opts, page: 1 });
    const total = parseTotalCount(first);
    const supplyName = SH_SUPPLY_TYPES.find((t) => t.code === opts.supplyType)?.name;
    const all = parseNoticeList(first, supplyName);
    const pages = Math.min(Math.ceil(total / PAGE_SIZE), 30);
    for (let page = 2; page <= pages; page++) {
      const html = await this.listNoticesHtml({ ...opts, page });
      const rows = parseNoticeList(html, supplyName);
      if (rows.length === 0) break;
      all.push(...rows);
    }
    // 같은 공고가 여러 페이지에 걸쳐 중복되는 경우 방지
    const seen = new Set<string>();
    return all.filter((n) => (seen.has(n.sh_id) ? false : (seen.add(n.sh_id), true)));
  }

  async getNoticeDetail(shId: string): Promise<ShNoticeDetail> {
    return parseNoticeDetail(await this.get(`${BASE}${VIEW_PATH}?multi_itm_seq=2&seq=${encodeURIComponent(shId)}`));
  }

  /** 첨부 다운로드. octet-stream으로 오므로 %PDF 매직 바이트로 확인한다. */
  async downloadPdf(att: ShAttachment): Promise<Uint8Array> {
    const res = await this.fetchImpl(att.url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; housing-assistant/0.1)", referer: `${BASE}${VIEW_PATH}?multi_itm_seq=2&seq=${att.seq}` },
    });
    if (!res.ok) throw new Error(`SH 첨부 다운로드 실패 HTTP ${res.status}: ${att.name}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const magic = String.fromCharCode(...bytes.slice(0, 5));
    if (magic !== "%PDF-") throw new Error(`PDF가 아닌 응답 (${magic.replace(/[^\x20-\x7e]/g, "?")}): ${att.name}`);
    return bytes;
  }
}
