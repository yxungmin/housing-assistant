import { describe, expect, it } from "vitest";
import { depositAt, fillRatio, snapDeposit } from "../src/lib/slider";

const STEP = 1_000_000;

describe("snapDeposit", () => {
  it("범위를 벗어난 값은 범위 안으로 들어온다", () => {
    expect(snapDeposit(-5_000_000, 10_000_000, 50_000_000, STEP)).toBe(10_000_000);
    expect(snapDeposit(90_000_000, 10_000_000, 50_000_000, STEP)).toBe(50_000_000);
  });

  it("100만 원 눈금에 붙는다", () => {
    expect(snapDeposit(23_400_000, 10_000_000, 50_000_000, STEP)).toBe(23_000_000);
    expect(snapDeposit(23_600_000, 10_000_000, 50_000_000, STEP)).toBe(24_000_000);
  });

  it("눈금은 최소값에서 시작한다 — 최소 보증금이 100만 원 배수가 아니어도 그 아래로 안 간다", () => {
    const min = 12_340_000;
    for (let x = min; x <= 20_000_000; x += 137_000) {
      expect(snapDeposit(x, min, 20_000_000, STEP)).toBeGreaterThanOrEqual(min);
    }
    expect(snapDeposit(13_000_000, min, 20_000_000, STEP)).toBe(13_340_000);
  });

  it("최대값은 눈금에 없어도 고를 수 있다 — 최대 전환이 이 화면에서 제일 자주 보는 값이다", () => {
    // 눈금은 … 19,340,000 / 20,340,000(>최대)이라 붙이기만 하면 최대에 닿지 못한다
    expect(snapDeposit(20_000_000, 12_340_000, 20_000_000, STEP)).toBe(20_000_000);
    expect(snapDeposit(19_900_000, 12_340_000, 20_000_000, STEP)).toBe(20_000_000);
  });

  it("고를 폭이 없으면 최소값 하나뿐이다", () => {
    expect(snapDeposit(99, 5_000_000, 5_000_000, STEP)).toBe(5_000_000);
  });
});

describe("depositAt", () => {
  const min = 10_000_000;
  const max = 50_000_000;

  it("왼쪽 끝은 최소, 오른쪽 끝은 최대", () => {
    expect(depositAt(0, 300, min, max, STEP)).toBe(min);
    expect(depositAt(300, 300, min, max, STEP)).toBe(max);
  });

  it("막대 밖으로 끌어도 범위 안에 머문다 — 손가락은 자주 막대를 벗어난다", () => {
    expect(depositAt(-120, 300, min, max, STEP)).toBe(min);
    expect(depositAt(900, 300, min, max, STEP)).toBe(max);
  });

  it("가운데는 가운데 값", () => {
    expect(depositAt(150, 300, min, max, STEP)).toBe(30_000_000);
  });

  it("오른쪽으로 갈수록 커진다", () => {
    let last = -1;
    for (let x = 0; x <= 300; x += 10) {
      const v = depositAt(x, 300, min, max, STEP);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it("레이아웃 전(폭 0)에는 최소값 — 0원을 만들지 않는다", () => {
    expect(depositAt(50, 0, min, max, STEP)).toBe(min);
  });
});

describe("fillRatio", () => {
  it("0에서 1 사이", () => {
    expect(fillRatio(10_000_000, 10_000_000, 50_000_000)).toBe(0);
    expect(fillRatio(50_000_000, 10_000_000, 50_000_000)).toBe(1);
    expect(fillRatio(30_000_000, 10_000_000, 50_000_000)).toBe(0.5);
  });

  it("고를 폭이 없으면 가득 찬다 — 빈 막대는 고장으로 보인다", () => {
    expect(fillRatio(5_000_000, 5_000_000, 5_000_000)).toBe(1);
  });
});
