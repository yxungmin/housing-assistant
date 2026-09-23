import { describe, expect, it } from "vitest";
import { dateRange, dateText, longDate, looseDate } from "../src/lib/format";

describe("날짜 표기", () => {
  it("표에서는 자릿수를 맞춘다", () => {
    expect(dateText("2026-09-17")).toBe("2026.09.17");
    expect(dateText("2026-10-01")).toBe("2026.10.01");
  });

  it("문장 안에서는 한국어로", () => {
    expect(longDate("2026-09-17")).toBe("2026년 9월 17일");
  });

  it("연도만 줄이고 달은 남긴다 — 일자만 남기면 '2026.09.28 ~ 30'이 되어 읽기 어렵다", () => {
    expect(dateRange("2026-09-29", "2026-09-30")).toBe("2026.09.29 ~ 09.30");
    expect(dateRange("2026-09-29", "2026-10-01")).toBe("2026.09.29 ~ 10.01");
    expect(dateRange("2026-12-29", "2027-01-05")).toBe("2026.12.29 ~ 2027.01.05");
  });

  it("공고문에서 온 값은 형태가 제각각이라 날짜일 때만 맞춘다", () => {
    expect(looseDate("2027-02-18")).toBe("2027.02.18");
    expect(looseDate("2027-02")).toBe("2027년 2월");
    expect(looseDate("공가 발생 시 개별 안내")).toBe("공가 발생 시 개별 안내");
    expect(looseDate(undefined)).toBe("-");
  });
});
