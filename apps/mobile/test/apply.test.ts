import { describe, expect, it } from "vitest";
import { applyLink } from "../src/lib/apply";

const now = new Date("2026-09-24T10:00:00+09:00");
const lh = "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300020753";
const sh = "https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?multi_itm_seq=2";

describe("applyLink", () => {
  it("접수 중인 LH 공고는 청약플러스에서 신청하러 간다", () => {
    expect(applyLink({ provider: "LH", detail_url: lh, apply_start: "2026-09-22", apply_end: "2026-09-30" }, now)).toEqual({ label: "LH청약플러스에서 신청하기", url: lh });
  });

  it("접수 전에는 신청하라고 하지 않는다 — 공고 페이지만 연다", () => {
    expect(applyLink({ provider: "LH", detail_url: lh, apply_start: "2026-09-29", apply_end: "2026-10-01" }, now)?.label).toBe("LH 공고 페이지 열기");
  });

  it("SH 상세는 게시판 글이라 접수 중이어도 공고 페이지라고만 부른다", () => {
    expect(applyLink({ provider: "SH", detail_url: sh, apply_start: "2026-09-22", apply_end: "2026-09-30" }, now)?.label).toBe("SH 공고 페이지 열기");
  });

  it("마감된 공고에는 띄우지 않는다", () => {
    expect(applyLink({ provider: "SH", detail_url: sh, apply_start: "2026-09-14", apply_end: "2026-09-17" }, now)).toBeNull();
  });

  it("주소가 없거나 http(s)가 아니면 띄우지 않는다", () => {
    expect(applyLink({ provider: "LH", apply_end: "2026-09-30" }, now)).toBeNull();
    expect(applyLink({ provider: "LH", detail_url: "javascript:alert(1)", apply_end: "2026-09-30" }, now)).toBeNull();
  });

  it("기관을 모르면 '기관'이라고 부른다", () => {
    expect(applyLink({ detail_url: sh, apply_end: "2026-09-30" }, now)?.label).toBe("기관 공고 페이지 열기");
  });

  it('현장 접수만 받는 공고에는 신청하기를 띄우지 않는다 — 틀린 안내다', () => {
    const r = applyLink({ provider: 'LH', detail_url: lh, apply_start: '2026-09-22', apply_end: '2026-09-30', extraction: { application: { online: false, onsite: true } } }, now);
    expect(r).toEqual({ label: 'LH 공고 페이지 열기', url: lh, onsiteOnly: true });
  });
});
