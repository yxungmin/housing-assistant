import { describe, expect, it } from "vitest";
import { collectDatasets, parseNoticeDetail, parseNoticeList, pickNoticePdf } from "../src/lh/api";
import { mapHousingType, mapRegionCode, normalizeDate } from "../src/lh/mapping";

describe("mapping", () => {
  it("maps LH type labels deterministically and reports unknowns", () => {
    expect(mapHousingType("행복주택", "임대주택").housing_type).toBe("happy");
    expect(mapHousingType("분양주택", "분양주택").housing_type).toBe("public_sale");
    expect(mapHousingType("공공분양(신혼희망)", "공공분양(신혼희망)", "시흥하중 신혼희망타운").housing_type).toBe("newlywed_hope");
    expect(mapHousingType("매입임대", "주거복지").housing_type).toBe("purchased_rental");
    expect(mapHousingType("통합공공임대", "임대주택").housing_type).toBe("long_term_rental");
    expect(mapHousingType("영구임대", "임대주택").housing_type).toBe("long_term_rental");
    const unknown = mapHousingType("이상한유형", "주거복지");
    expect(unknown.housing_type).toBe("other");
    expect(unknown.unknown).toContain("이상한유형");
  });
  it("maps region names to codes, including 특별자치도 and 통합시", () => {
    expect(mapRegionCode("서울특별시")).toEqual({ region_code: "11" });
    expect(mapRegionCode("경기도")).toEqual({ region_code: "41" });
    expect(mapRegionCode("전북특별자치도")).toEqual({ region_code: "45" });
    expect(mapRegionCode("경상남도")).toEqual({ region_code: "48" });
    expect(mapRegionCode("인천광역시 외")).toEqual({ region_code: "28" });
    expect(mapRegionCode("화성시").unknown).toBe("화성시");
  });
  it("normalizes dates", () => {
    expect(normalizeDate("20260901")).toBe("2026-09-01");
    expect(normalizeDate("2026.09.01")).toBe("2026-09-01");
    expect(normalizeDate("")).toBeUndefined();
  });
});

// 2026-09-20 실제 응답 (collector/.cache/lh-list.json)에서 옮긴 형태
const realListPayload = [
  { dsSch: [{ PAN_ED_DT: "20260920", PG_SZ: "20", PAN_ST_DT: "20260720", PAGE: "1" }] },
  {
    dsList: [
      {
        PAN_NT_ST_DT: "2026.09.18",
        PAN_ID: "2015122300020801",
        AIS_TP_CD_NM: "영구임대",
        CNP_CD_NM: "전북특별자치도",
        ALL_CNT: "628",
        SPL_INF_TP_CD: "062",
        AIS_TP_CD: "09",
        PAN_DT: "20260918",
        RNUM: "1",
        CCR_CNNT_SYS_DS_CD: "03",
        DTL_URL: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300020801",
        CLSG_DT: "2026.09.29",
        UPP_AIS_TP_CD: "06",
        PAN_NM: "군산나운4 영구임대주택 입주자격완화 예비입주자 모집 공고",
        UPP_AIS_TP_NM: "임대주택",
        PAN_SS: "공고중",
      },
      {
        PAN_ID: "L1",
        PAN_NM: "화성향남2 단독주택 및 텃밭용지 재공급공고",
        UPP_AIS_TP_CD: "01",
        UPP_AIS_TP_NM: "토지",
        AIS_TP_CD: "01",
        AIS_TP_CD_NM: "토지",
        CNP_CD_NM: "경기도",
        ALL_CNT: "628",
      },
    ],
  },
  { resHeader: [{ RS_DTTM: "20260920062804", SS_CODE: "Y" }] },
];

const realDetailPayload = [
  { dsSch: [{ PAN_ID: "2015122300020801", CCR_CNNT_SYS_DS_CD: "03", SPL_INF_TP_CD: "062", UPP_AIS_TP_CD: "09" }] },
  {
    dsSplScdl: [{ PPR_ACP_CLSG_DT: "2026.09.29", PZWR_ANC_DT: "2026.12.04", SBSC_ACP_ST_DT: "2026.09.29", SBSC_ACP_CLSG_DT: "2026.09.29", CTRT_ST_DT: "" }],
    dsSbdNm: [{ LGDN_ADR: "단지주소", HSH_CNT: "총세대수" }],
    dsEtcInfo: [{ ETC_CTS: "<예비입주자 선정 세부 절차> ...", CRC_RSN: "" }],
    dsAhflInfo: [
      { AHFL_URL: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68659193", SL_PAN_AHFL_DS_CD_NM: "공고문(hwp)", CMN_AHFL_NM: "군산나운4...모집공고문.hwpx" },
      { AHFL_URL: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68659195", SL_PAN_AHFL_DS_CD_NM: "공고문(PDF)", CMN_AHFL_NM: "군산나운4...모집공고문(모집공고일2026.09.18.).pdf" },
    ],
    dsSbd: [{ LGDN_ADR: "전북특별자치도 군산시 문화로 36(나운동,군산 나운 영구임대아파트)", LGDN_DTL_ADR: "", HSH_CNT: "1954", HTN_FMLA_DESC: "중앙가스난방", LCC_NT_NM: "군산나운4단지", DDO_AR: "26.37~52.74", MVIN_XPC_YM: "1993.05" }],
    dsAhflInfoNm: [{ AHFL_URL: "다운로드", SL_PAN_AHFL_DS_CD_NM: "파일구분명", CMN_AHFL_NM: "첨부파일명" }],
    resHeader: [{ RS_DTTM: "20260920062804", SS_CODE: "Y" }],
  },
];

describe("LH payload parsing (real 2026-09-20 shape)", () => {
  it("collects datasets scattered across the payload", () => {
    const ds = collectDatasets(realListPayload);
    expect(Object.keys(ds).sort()).toEqual(["dsList", "dsSch", "resHeader"]);
  });
  it("parses the list into summaries with codes needed for the detail call", () => {
    const [n, land] = parseNoticeList(realListPayload);
    expect(n).toMatchObject({
      lh_id: "2015122300020801",
      housing_type: "long_term_rental",
      region_code: "45",
      notice_date: "2026-09-18",
      apply_end: "2026-09-29",
      supply_type_code: "062",
      system_code: "03",
      upp_type_code: "06",
      ais_type_code: "09",
      total_count: 628,
      status_raw: "공고중",
    });
    expect(n!.unknown_codes).toEqual([]);
    expect(land!.housing_type).toBe("other");
    expect(land!.unknown_codes[0]).toContain("토지");
  });
  it("parses detail: schedule, complex, correction reason, attachments", () => {
    const d = parseNoticeDetail(realDetailPayload);
    expect(d.address).toContain("군산시 문화로 36");
    expect(d.complex_name).toBe("군산나운4단지");
    expect(d.households).toBe(1954);
    expect(d.apply_start).toBe("2026-09-29");
    expect(d.apply_end).toBe("2026-09-29");
    expect(d.winner_announce).toBe("2026-12-04");
    expect(d.correction_reason).toBeUndefined();
    // 헤더 행(dsAhflInfoNm의 "다운로드")은 URL이 아니므로 첨부에서 제외된다
    expect(d.attachments).toHaveLength(2);
  });
  it("prefers the 공고문(PDF) attachment even though the URL has no .pdf extension", () => {
    const d = parseNoticeDetail(realDetailPayload);
    expect(pickNoticePdf(d.attachments)?.url).toBe("https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68659195");
  });
});
