import { describe, expect, it } from "vitest";
import { koreanWon } from "../src/lib/format";

describe("koreanWon", () => {
  it("만 단위를 한글로 읽는다", () => {
    expect(koreanWon(43_520_000)).toBe("4천3백52만 원");
    expect(koreanWon(340_811)).toBe("34만 원");
    expect(koreanWon(2_000_000)).toBe("2백만 원");
    expect(koreanWon(100_000)).toBe("10만 원");
  });

  it("억은 앞에 따로 뗀다", () => {
    expect(koreanWon(162_000_000)).toBe("1억 6천2백만 원");
    expect(koreanWon(514_020_000)).toBe("5억 1천4백2만 원");
    expect(koreanWon(300_000_000)).toBe("3억 원");
  });

  it("천 원 아래는 버린다 — 이 화면에서 아무 판단도 바꾸지 않는다", () => {
    expect(koreanWon(34_816_000)).toBe("3천4백81만 원");
    expect(koreanWon(66_731)).toBe("6만 원");
  });

  it("만 원이 안 되면 읽어 줄 것이 없다", () => {
    expect(koreanWon(9_999)).toBe("");
    expect(koreanWon(0)).toBe("");
    expect(koreanWon(undefined)).toBe("");
  });

  it("음수는 부호를 살린다 (대출은 빼는 돈이다)", () => {
    expect(koreanWon(-34_816_000)).toBe("−3천4백81만 원");
  });

  it("조 단위도 깨지지 않는다", () => {
    expect(koreanWon(1_234_500_000_000)).toBe("12,345억 원");
  });
});
