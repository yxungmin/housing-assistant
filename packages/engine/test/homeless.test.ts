import { describe, expect, it } from "vitest";
import { homelessBasis, homelessBasisReason } from "../src/homeless";

const TODAY = new Date("2026-09-21T00:00:00+09:00");

describe("homelessBasis", () => {
  it("만 30세가 되는 날부터 센다", () => {
    const b = homelessBasis({ birth_date: "1990-03-15", marriage: "single" }, TODAY)!;
    expect(b.from).toBe("2020-03-15");
    expect(b.reason).toBe("age30");
    expect(b.months).toBe(78); // 2020-03-15 → 2026-09-21
  });

  it("아직 만 30세가 안 됐으면 0개월 — 음수로 세지 않는다", () => {
    const b = homelessBasis({ birth_date: "1998-03-15", marriage: "single" }, TODAY)!;
    expect(b.from).toBe("2028-03-15");
    expect(b.months).toBe(0);
  });

  it("만 30세 전에 혼인했으면 혼인 시점부터 센다", () => {
    // 1996년생은 2026년에 만 30세. 혼인 8년차면 2018년 혼인이라 그쪽이 이르다.
    const b = homelessBasis({ birth_date: "1996-05-10", marriage: "married", marriage_years: 8 }, TODAY)!;
    expect(b.from).toBe("2018-09-21");
    expect(b.reason).toBe("marriage");
  });

  it("만 30세 뒤에 혼인했으면 혼인은 기준이 아니다", () => {
    const b = homelessBasis({ birth_date: "1985-05-10", marriage: "married", marriage_years: 3 }, TODAY)!;
    expect(b.from).toBe("2015-05-10");
    expect(b.reason).toBe("age30");
  });

  it("혼인 기간이 0년이면(예비 신혼부부) 혼인을 기준으로 삼지 않는다", () => {
    const b = homelessBasis({ birth_date: "1998-03-15", marriage: "married", marriage_years: 0 }, TODAY)!;
    expect(b.reason).toBe("age30");
  });

  it("생년월일이 없으면 셀 수 없다 — 지어내지 않고 null", () => {
    expect(homelessBasis({ marriage: "single" }, TODAY)).toBeNull();
  });

  it("2월 29일생의 30년 뒤는 2월 28일 — 3월로 넘기지 않는다", () => {
    const b = homelessBasis({ birth_date: "1996-02-29", marriage: "single" }, TODAY)!;
    expect(b.from).toBe("2026-02-28");
  });

  it("왜 그날부터인지 한 줄로 말한다", () => {
    expect(homelessBasisReason({ from: "2020-03-15", months: 78, reason: "age30", future: false })).toContain("만 30세가 된 2020년 3월");
    expect(homelessBasisReason({ from: "2018-09-21", months: 96, reason: "marriage", future: false })).toContain("혼인 시점(2018년 9월)");
  });

  it("아직 만 30세가 안 됐으면 '셌어요'라고 하지 않는다 — 셀 것이 아직 없다", () => {
    const b = homelessBasis({ birth_date: "1998-03-15", marriage: "single" }, TODAY)!;
    expect(b.future).toBe(true);
    expect(homelessBasisReason(b)).toContain("만 30세가 되는 2028년 3월부터 쌓여요");
  });

  it("이미 만 30세가 지났으면 future는 false", () => {
    expect(homelessBasis({ birth_date: "1990-03-15", marriage: "single" }, TODAY)!.future).toBe(false);
  });
});
