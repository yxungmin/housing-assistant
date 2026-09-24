/**
 * 공급기관 어댑터. 기관마다 목록·상세·첨부를 가져오는 방법이 다르지만
 * 그 뒤(PDF → 텍스트 → 섹션 → LLM → 검증 → 저장)는 완전히 같다.
 * 새 기관을 붙일 때는 이 파일에 Source 하나를 더하면 된다.
 */
import type { HousingType, SupplyUnit } from "@housing/schema";
import type { Provider } from "./db/supabase";
import { LhClient, parseNoticeDetail as parseLhDetail, pickNoticePdf as pickLhPdf, type LhImage, type LhNoticeSummary } from "./lh/api";
import { ShClient, pickNoticePdf as pickShPdf } from "./sh/api";
import { parseUnitList, pickUnitList } from "./units/list";

/** 목록까지만 읽은 공고. 상세·PDF는 resolve()에서 가져온다 (수정 없으면 호출하지 않는다). */
export interface CollectedNotice {
  provider: Provider;
  /** 기관 내부 식별자 (LH PAN_ID, SH 게시판 seq) */
  external_id: string;
  title: string;
  housing_type: HousingType;
  region_code: string;
  notice_date?: string;
  apply_end?: string;
  status_raw?: string;
  /** 기관 사이트의 공고 상세 페이지. 앱이 외부 브라우저로 연다 */
  detail_url?: string;
  unknown_codes: string[];
  /** 목록만으로 만든 수정 탐지 키. 이 값이 그대로면 상세를 부르지 않는다. */
  list_key: string;
  resolve: () => Promise<ResolvedNotice>;
}

export interface ResolvedNotice {
  /** 상세까지 반영한 수정 탐지 키. 저장된 값과 같으면 건너뛴다. */
  modified_key: string;
  address?: string;
  /**
   * 공급기관이 부르는 단지 이름 (LH 상세의 `dsSbd.LCC_NT_NM`).
   * 지난 회차 결과를 이을 때 쓴다 — 공고 제목에는 단지 꼬리표가 없는 일이 흔하다.
   * SH는 게시판 HTML이라 이 값이 없다.
   */
  complex?: string;
  /** 단지 세대수 (LH 상세 dsSbd.HSH_CNT). 관리비 지역 표본을 비슷한 크기로 고르는 기준 */
  households?: number;
  apply_start?: string;
  apply_end?: string;
  correction_reason?: string;
  /** url은 기관 사이트의 원문 첨부 주소. Supabase Storage에 올리기 전이나 로컬 데이터에서 원문을 열 때 쓴다. */
  pdf?: { bytes: Uint8Array; name: string; url: string };
  /** PDF를 못 구한 이유 (CONFLICT 사유로 기록) */
  missing_pdf?: string;
  /**
   * 기관이 공고에 이미지로 붙여 둔 것 (위치도·단지조감도).
   * 공고문 PDF에서 우리가 뽑은 그림이 아니다 — 기관이 이미지 파일로 준 것만 담는다.
   * SH는 게시판에 이런 이미지가 없어 항상 비어 있다.
   */
  images?: LhImage[];
  /**
   * 흩어진 집 목록 (매입임대·전세임대). 공고문이 아니라 별도 엑셀 첨부에 있다.
   * 이 유형은 총 호수만으로는 아무것도 고를 수 없어서 목록이 곧 내용이다.
   */
  units?: SupplyUnit[];
}

export interface Source {
  provider: Provider;
  list: () => Promise<CollectedNotice[]>;
}

/** LH: 공공데이터포털 분양임대공고 API */
export function lhSource(client: LhClient): Source {
  return {
    provider: "LH",
    list: async () => {
      const rows = await client.listAllHousingNotices();
      return rows.filter((n) => n.status_raw !== "접수마감").map((n) => toLhNotice(client, n));
    },
  };
}

function toLhNotice(client: LhClient, n: LhNoticeSummary): CollectedNotice {
  const list_key = `${n.notice_date ?? ""}|${n.apply_end ?? ""}`;
  return {
    provider: "LH",
    external_id: n.lh_id,
    title: n.title,
    housing_type: n.housing_type,
    region_code: n.region_code,
    notice_date: n.notice_date,
    apply_end: n.apply_end,
    status_raw: n.status_raw,
    detail_url: n.detail_url,
    unknown_codes: n.unknown_codes,
    list_key,
    resolve: async () => {
      const detail = parseLhDetail(await client.getNoticeDetail(n));
      const pdf = pickLhPdf(detail.attachments);
      const resolved: ResolvedNotice = {
        modified_key: `${list_key}|${detail.correction_reason ?? ""}`,
        address: detail.address,
        complex: detail.complex_name,
        households: detail.households,
        apply_start: detail.apply_start,
        apply_end: detail.apply_end ?? n.apply_end,
        correction_reason: detail.correction_reason,
        images: detail.images,
      };
      // 매입임대·전세임대는 집 목록이 별도 엑셀로 온다. 없으면 없는 대로 둔다 (단지형 공고).
      const listFile = pickUnitList(detail.attachments);
      const units = listFile ? await client.download(listFile.url).then((b) => parseUnitList(Buffer.from(b))).catch(() => undefined) : undefined;
      const withUnits = { ...resolved, units: units?.length ? units : undefined };
      if (!pdf) return { ...withUnits, missing_pdf: "모집공고문 PDF 첨부를 찾지 못함" };
      return { ...withUnits, pdf: { bytes: await client.downloadPdf(pdf.url), name: pdf.name, url: pdf.url } };
    },
  };
}

/** SH: 공개 API가 없어 게시판 HTML을 읽는다 (sh/api.ts 주석 참고) */
export function shSource(client: ShClient): Source {
  return {
    provider: "SH",
    list: async () => {
      const rows = await client.listAllRentalNotices();
      return rows.map((n) => {
        const list_key = `${n.notice_date ?? ""}|${n.title}`;
        return {
          provider: "SH" as const,
          external_id: n.sh_id,
          title: n.title,
          housing_type: n.housing_type,
          region_code: n.region_code,
          notice_date: n.notice_date,
          status_raw: n.corrected ? "정정공고" : undefined,
          detail_url: n.detail_url,
          unknown_codes: n.unknown_codes,
          list_key,
          resolve: async (): Promise<ResolvedNotice> => {
            const detail = await client.getNoticeDetail(n.sh_id);
            const pdf = pickShPdf(detail.attachments);
            // SH는 수정일시를 주지 않는다. 첨부의 (순번:크기)가 바뀌면 공고문이 교체된 것으로 본다.
            const resolved: ResolvedNotice = {
              modified_key: `${list_key}|${detail.content_key}`,
              correction_reason: n.corrected ? "제목에 정정·수정 표기" : undefined,
            };
            if (!pdf) {
              const names = detail.attachments.map((a) => a.name).join(", ");
              return { ...resolved, missing_pdf: `모집공고문 PDF 첨부를 찾지 못함 (첨부: ${names || "없음"})` };
            }
            return { ...resolved, pdf: { bytes: await client.downloadPdf(pdf), name: pdf.name, url: pdf.url } };
          },
        };
      });
    },
  };
}

/** 수집 대상 지역 필터. 빈 배열이면 전체. */
export function inRegions(notice: CollectedNotice, regions: string[]): boolean {
  return regions.length === 0 || regions.includes(notice.region_code);
}
