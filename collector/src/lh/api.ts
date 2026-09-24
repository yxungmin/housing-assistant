import { mapHousingType, mapRegionCode, normalizeDate } from "./mapping";
import type { HousingType } from "@housing/schema";
import { resilientFetch } from "../http";

/**
 * LH 분양임대공고 조회 서비스 (공공데이터포털, 제공기관 코드 B552555).
 *  - 목록: /B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1
 *  - 상세: /B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1
 *
 * 2026-09-20 실제 응답으로 확인한 구조 (collector/.cache/lh-*.json):
 *  - 응답은 [{dsSch:[요청 에코]}, {dsList:[...]}, {resHeader:[{SS_CODE}]}] 형태의 배열.
 *  - 목록 행: PAN_ID, PAN_NM, UPP_AIS_TP_CD/NM(01 토지, 05 분양주택, 06 임대주택, 13 주거복지, 39 공공분양(신혼희망)),
 *    AIS_TP_CD/NM(09 영구임대, 10 행복주택, 26 매입임대, 48 통합공공임대 ...), CNP_CD_NM, PAN_NT_ST_DT(2026.09.18),
 *    CLSG_DT, PAN_SS(공고중/상담요청/접수마감), SPL_INF_TP_CD, CCR_CNNT_SYS_DS_CD, DTL_URL, ALL_CNT.
 *  - 기간 파라미터 PAN_NT_ST_DT·CLSG_DT는 서버가 공고일 범위(PAN_ST_DT~PAN_ED_DT)로 해석한다.
 *  - 상세: dsSbd(LGDN_ADR 단지주소, LCC_NT_NM 단지명, HSH_CNT 총세대수, DDO_AR 전용면적, MVIN_XPC_YM),
 *    dsSplScdl(SBSC_ACP_ST_DT/SBSC_ACP_CLSG_DT 접수기간, PZWR_ANC_DT 당첨자발표),
 *    dsAhflInfo(AHFL_URL, SL_PAN_AHFL_DS_CD_NM "공고문(PDF)"/"공고문(hwp)", CMN_AHFL_NM), dsEtcInfo(CRC_RSN 정정/취소사유).
 *    dsSbdAhfl(AHFL_URL, LS_SPL_INF_UPL_FL_DS_CD_NM "위치도"/"단지조감도", CMN_AHFL_NM) — 단지 이미지.
 *    lhImageView2.do?fileid=... 로 바로 열리는 그림이다. 첨부(dsAhflInfo)와 별개 데이터셋이라 따로 읽는다.
 *    붙어 있는 공고가 더 적다 (2026-09-21 표본 3건 중 1건).
 *  - AHFL_URL은 lhFile.do?fileid=... 형태로 확장자가 없고 Content-Disposition에 파일명이 온다.
 */
const BASE = "https://apis.data.go.kr/B552555";

/** 주택 공고로 취급하는 상위 유형 코드. 01 토지, 상가 등은 수집하지 않는다. */
export const HOUSING_UPP_CODES = ["05", "06", "13", "39"] as const;

export interface LhNoticeSummary {
  lh_id: string; // PAN_ID
  title: string; // PAN_NM
  housing_type: HousingType;
  housing_type_raw: string;
  region_name: string;
  region_code: string;
  notice_date?: string; // PAN_NT_ST_DT
  apply_end?: string; // CLSG_DT
  status_raw?: string; // PAN_SS
  detail_url?: string; // DTL_URL
  supply_type_code?: string; // SPL_INF_TP_CD (상세 조회 파라미터)
  system_code?: string; // CCR_CNNT_SYS_DS_CD (상세 조회 파라미터)
  upp_type_code?: string; // UPP_AIS_TP_CD (상세 조회 파라미터)
  ais_type_code?: string; // AIS_TP_CD
  total_count?: number; // ALL_CNT (페이지네이션용)
  unknown_codes: string[];
}

export interface LhAttachment {
  name: string;
  url: string;
  kind?: string; // SL_PAN_AHFL_DS_CD_NM
}

/** 단지 이미지 (위치도·단지조감도). 기관이 이미지로 준 것만이라 출처가 분명하다. */
export interface LhImage {
  kind: string; // LS_SPL_INF_UPL_FL_DS_CD_NM
  name?: string; // CMN_AHFL_NM
  url: string; // AHFL_URL
}

export interface LhNoticeDetail {
  attachments: LhAttachment[];
  images: LhImage[];
  address?: string;
  complex_name?: string;
  households?: number;
  exclusive_area_raw?: string;
  move_in_raw?: string;
  apply_start?: string;
  apply_end?: string;
  winner_announce?: string;
  /** 정정/취소 사유. 비어 있지 않으면 수정 공고 */
  correction_reason?: string;
  raw: unknown;
}

type Json = Record<string, unknown>;

function str(o: Json | undefined, key: string): string | undefined {
  if (!o) return undefined;
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/** 공공데이터포털 응답은 [{ dsList: [...] }, { resHeader: [...] }] 처럼 배열 안에 dataset이 흩어져 있다. */
export function collectDatasets(payload: unknown): Record<string, Json[]> {
  const out: Record<string, Json[]> = {};
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Json)) {
        if (Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
          out[k] = [...(out[k] ?? []), ...(v as Json[])];
        } else if (v && typeof v === "object") {
          visit(v);
        }
      }
    }
  };
  visit(payload);
  return out;
}

export function parseNoticeList(payload: unknown): LhNoticeSummary[] {
  const datasets = collectDatasets(payload);
  const rows = datasets.dsList ?? [];
  return rows
    .map((row): LhNoticeSummary | null => {
      const lhId = str(row, "PAN_ID");
      const title = str(row, "PAN_NM");
      if (!lhId || !title) return null;
      const typeRaw = [str(row, "UPP_AIS_TP_NM"), str(row, "AIS_TP_CD_NM")].filter(Boolean).join(" / ");
      const type = mapHousingType(str(row, "AIS_TP_CD_NM"), str(row, "UPP_AIS_TP_NM"), title);
      const region = mapRegionCode(str(row, "CNP_CD_NM"));
      const unknown: string[] = [];
      if (type.unknown) unknown.push(`housing_type:${type.unknown}`);
      if (region.unknown) unknown.push(`region:${region.unknown}`);
      const total = Number(str(row, "ALL_CNT"));
      return {
        lh_id: lhId,
        title,
        housing_type: type.housing_type,
        housing_type_raw: typeRaw,
        region_name: str(row, "CNP_CD_NM") ?? "",
        region_code: region.region_code,
        notice_date: normalizeDate(str(row, "PAN_NT_ST_DT") ?? str(row, "PAN_DT")),
        apply_end: normalizeDate(str(row, "CLSG_DT")),
        status_raw: str(row, "PAN_SS"),
        detail_url: str(row, "DTL_URL"),
        supply_type_code: str(row, "SPL_INF_TP_CD"),
        system_code: str(row, "CCR_CNNT_SYS_DS_CD"),
        upp_type_code: str(row, "UPP_AIS_TP_CD"),
        ais_type_code: str(row, "AIS_TP_CD"),
        total_count: Number.isFinite(total) ? total : undefined,
        unknown_codes: unknown,
      };
    })
    .filter((x): x is LhNoticeSummary => x !== null);
}


/**
 * 단지 이미지 주소를 그림 파일 주소로 바꾼다.
 *
 * AHFL_URL로 오는 건 그림이 아니라 그림 한 장을 담은 HTML 페이지다 (2026-09-21 확인):
 *   GET lhImageView2.do?fileid=68586052 → <img src="/upload/Files/.../2026091468586052.jpg">
 * 앱이 그 주소를 <img>에 그대로 넣으면 HTML을 그리려다 깨진 그림이 된다.
 *
 * 그 HTML을 파싱하는 길은 버렸다. 같은 요청이 curl에는 진짜 경로를, Node fetch에는
 * noImg.gif를 돌려준다. 무엇 때문에 갈리는지 알아내지 못했고, 알아낸다 해도 서버 사정에
 * 기대는 코드가 된다. 조용히 빈 그림을 저장하게 될 자리다.
 *
 * 대신 같은 fileid를 파일 내려받기 엔드포인트에 넣는다. 공고문 PDF를 받는 그 엔드포인트다:
 *   GET lhFile.do?fileid=68586052 → 518,310바이트 JPEG (ff d8 ff)
 * 페이지가 가리키던 파일과 크기까지 같다. Content-Type은 octet-stream으로 오지만
 * <img>는 내용을 보고 그림으로 읽는다.
 */
export const directImageUrl = (viewUrl: string): string => viewUrl.replace(/lhImageView2?\.do/i, "lhFile.do");

/** 파일 앞머리 몇 바이트로 그림인지 본다. 본문 전체(장당 0.5MB)를 받지 않으려고 읽자마자 끊는다. */
async function isImage(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { headers: { Range: "bytes=0-7" } });
    if (!res.ok || !res.body) return false;
    const reader = res.body.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    if (!value || value.length < 3) return false;
    const [a, b, c] = value;
    // JPEG(ff d8 ff) · PNG(89 50 4e) · GIF(47 49 46)
    return (a === 0xff && b === 0xd8 && c === 0xff) || (a === 0x89 && b === 0x50 && c === 0x4e) || (a === 0x47 && b === 0x49 && c === 0x46);
  } catch {
    return false;
  }
}

/**
 * 그림으로 확인된 것만 남긴다. 순서는 공고가 준 대로 (위치도 → 조감도 → 배치도) 둔다.
 * 확인하지 못한 것은 버린다 — 화면의 깨진 그림 한 장은 "이 앱이 고장났다"로 읽힌다.
 */
export async function resolveImages(images: LhImage[], fetchImpl: typeof fetch = resilientFetch()): Promise<LhImage[]> {
  const out: LhImage[] = [];
  for (const img of images) {
    const url = directImageUrl(img.url);
    if (await isImage(url, fetchImpl)) out.push({ ...img, url });
  }
  return out;
}

const isHttp = (url: string): boolean => /^https?:\/\//.test(url);

export function parseNoticeDetail(payload: unknown): LhNoticeDetail {
  const datasets = collectDatasets(payload);
  const attachments: LhAttachment[] = (datasets.dsAhflInfo ?? [])
    .map((f) => ({
      name: str(f, "CMN_AHFL_NM") ?? "",
      url: str(f, "AHFL_URL") ?? "",
      kind: str(f, "SL_PAN_AHFL_DS_CD_NM"),
    }))
    .filter((f) => /^https?:\/\//.test(f.url));
  // 단지 이미지는 별도 데이터셋이다. dsSbdAhflNm은 라벨 행이라 쓰지 않는다 (dsAhflInfo/dsAhflInfoNm과 같은 규칙).
  const images: LhImage[] = (datasets.dsSbdAhfl ?? [])
    .map((f) => ({ kind: str(f, "LS_SPL_INF_UPL_FL_DS_CD_NM") ?? "", name: str(f, "CMN_AHFL_NM"), url: str(f, "AHFL_URL") ?? "" }))
    .filter((f) => isHttp(f.url));
  const sbd = datasets.dsSbd?.[0];
  const scdl = datasets.dsSplScdl?.[0];
  const etc = datasets.dsEtcInfo?.[0];
  const households = Number(str(sbd, "HSH_CNT"));
  return {
    attachments,
    images,
    address: str(sbd, "LGDN_ADR"),
    complex_name: str(sbd, "LCC_NT_NM"),
    households: Number.isFinite(households) && households > 0 ? households : undefined,
    exclusive_area_raw: str(sbd, "DDO_AR"),
    move_in_raw: str(sbd, "MVIN_XPC_YM"),
    apply_start: normalizeDate(str(scdl, "SBSC_ACP_ST_DT")),
    apply_end: normalizeDate(str(scdl, "SBSC_ACP_CLSG_DT")),
    winner_announce: normalizeDate(str(scdl, "PZWR_ANC_DT")),
    correction_reason: str(etc, "CRC_RSN"),
    raw: payload,
  };
}

/** 첨부 중 모집공고문 PDF 하나. 파일구분 "공고문(PDF)" 우선, 다음은 이름이 .pdf인 공고문, 다음은 아무 PDF. */
export function pickNoticePdf(attachments: LhAttachment[]): LhAttachment | undefined {
  const isPdf = (a: LhAttachment) => /pdf/i.test(a.kind ?? "") || /\.pdf$/i.test(a.name) || /\.pdf(\?|$)/i.test(a.url);
  const pdfs = attachments.filter(isPdf);
  return (
    pdfs.find((a) => /공고문\s*\(?pdf/i.test(a.kind ?? "")) ??
    pdfs.find((a) => /공고문|모집공고/.test(a.name)) ??
    pdfs[0]
  );
}

const dot = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

export interface ListOptions {
  page?: number;
  pageSize?: number;
  /** 공고일 범위 시작. 기본 90일 전 */
  noticeFrom?: Date;
  /** 공고일 범위 끝. 기본 오늘 */
  noticeTo?: Date;
  /** 상위 유형 코드 필터 (05 분양주택, 06 임대주택, 13 주거복지, 39 공공분양(신혼희망)) */
  uppTypeCode?: string;
  statusFilter?: string;
}

export class LhClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = resilientFetch(),
  ) {}

  private async get(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("serviceKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`LH API ${path} HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`LH API ${path} 응답이 JSON이 아니다 (XML 오류 메시지일 수 있음): ${text.slice(0, 200)}`);
    }
  }

  /** 공고 목록 한 페이지 (원본 응답). */
  async listNotices(opts: ListOptions = {}): Promise<unknown> {
    const from = opts.noticeFrom ?? new Date(Date.now() - 90 * 86_400_000);
    const to = opts.noticeTo ?? new Date();
    return this.get("/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1", {
      PG_SZ: opts.pageSize ?? 100,
      PAGE: opts.page ?? 1,
      PAN_NT_ST_DT: dot(from),
      CLSG_DT: dot(to),
      UPP_AIS_TP_CD: opts.uppTypeCode,
      PAN_SS: opts.statusFilter,
    });
  }

  /**
   * 주택 공고 전체 (토지·상가 제외). 유형 코드별로 ALL_CNT까지 페이지를 넘긴다.
   * 90일 기준 수백 건이라 한 실행에 3~8회 호출.
   */
  async listAllHousingNotices(opts: Omit<ListOptions, "page" | "uppTypeCode"> = {}): Promise<LhNoticeSummary[]> {
    const pageSize = opts.pageSize ?? 100;
    const all: LhNoticeSummary[] = [];
    const seen = new Set<string>();
    for (const code of HOUSING_UPP_CODES) {
      for (let page = 1; page <= 20; page++) {
        const rows = parseNoticeList(await this.listNotices({ ...opts, page, pageSize, uppTypeCode: code }));
        for (const r of rows) {
          if (seen.has(r.lh_id)) continue;
          seen.add(r.lh_id);
          all.push(r);
        }
        const total = rows[0]?.total_count ?? 0;
        if (rows.length < pageSize || page * pageSize >= total) break;
      }
    }
    return all;
  }

  async getNoticeDetail(notice: Pick<LhNoticeSummary, "lh_id" | "supply_type_code" | "system_code" | "upp_type_code" | "ais_type_code">): Promise<unknown> {
    return this.get("/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1", {
      PAN_ID: notice.lh_id,
      SPL_INF_TP_CD: notice.supply_type_code,
      CCR_CNNT_SYS_DS_CD: notice.system_code,
      UPP_AIS_TP_CD: notice.upp_type_code,
      AIS_TP_CD: notice.ais_type_code,
    });
  }

  /** 첨부 다운로드. LH는 octet-stream으로 주므로 %PDF 매직 바이트로 확인한다. */
  /** 첨부 아무거나. 공고문 PDF는 downloadPdf가 형식까지 확인하므로 그쪽을 쓴다. */
  async download(url: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`첨부 내려받기 실패 HTTP ${res.status}: ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadPdf(url: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`PDF 다운로드 실패 HTTP ${res.status}: ${url}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const magic = String.fromCharCode(...bytes.slice(0, 5));
    if (magic !== "%PDF-") throw new Error(`PDF가 아닌 응답 (${magic.replace(/[^\x20-\x7e]/g, "?")}): ${url}`);
    return bytes;
  }
}
