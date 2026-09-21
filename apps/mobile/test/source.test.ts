import { describe, expect, it } from "vitest";
import { hasSource, sourceUrl } from "../src/lib/source";

const url = "https://example.supabase.co/storage/v1/object/public/announcement-pdfs/SH/309467/v1.pdf";

describe("source", () => {
  it("쪽수가 있으면 #page로 붙인다", () => {
    expect(sourceUrl(url, 23)).toBe(`${url}#page=23`);
  });

  it("쪽수가 없거나 0이면 그냥 원문 주소", () => {
    expect(sourceUrl(url)).toBe(url);
    expect(sourceUrl(url, 0)).toBe(url);
  });

  it("쿼리가 붙은 기관 주소에도 조각만 더한다", () => {
    const sh = "https://www.i-sh.co.kr/main/com/file/innoFD.do?brdId=GS0401&seq=309467&fileTp=A&fileSeq=1";
    expect(sourceUrl(sh, 5)).toBe(`${sh}#page=5`);
  });

  it("주소가 없거나 http(s)가 아니면 열기를 내보이지 않는다", () => {
    expect(hasSource(url)).toBe(true);
    expect(hasSource(undefined)).toBe(false);
    expect(hasSource("")).toBe(false);
    expect(hasSource("javascript:alert(1)")).toBe(false);
    expect(hasSource("file:///etc/passwd")).toBe(false);
  });
});
