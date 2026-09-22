import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { parseUnitList, pickUnitList } from "../src/units/list";
import { columnIndex } from "../src/xlsx";
import { fromRoot } from "../src/paths";

describe("columnIndex", () => {
  it("엑셀 열 이름을 0부터의 번호로", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("E10")).toBe(4);
    expect(columnIndex("Z1")).toBe(25);
    expect(columnIndex("AA1")).toBe(26);
    expect(columnIndex("AB100")).toBe(27);
  });
});

describe("pickUnitList", () => {
  it("이름으로 목록 첨부를 고른다", () => {
    const files = [
      { name: "26년3차신혼·신생아매입임대Ⅰ입주자모집공고문(서울지역본부).pdf", url: "u1" },
      { name: "26년3차_신혼·신생아매입임대Ⅰ_공급주택목록(서울지역본부).xlsx", url: "u2" },
      { name: "26년신혼·신생아매입임대Ⅰ_QnA.hwpx", url: "u3" },
    ];
    expect(pickUnitList(files)?.url).toBe("u2");
  });

  it("엑셀이 아니면 고르지 않는다 — 공고문 PDF에도 '주택목록'이 들어갈 수 있다", () => {
    expect(pickUnitList([{ name: "주택목록 안내.pdf", url: "u1" }])).toBeUndefined();
  });

  it("목록이 없는 공고도 있다", () => {
    expect(pickUnitList([{ name: "공고문.pdf", url: "u1" }])).toBeUndefined();
  });
});

/**
 * 실제 파일로 확인한다. 열 위치를 짐작해서 만든 파서라 진짜 파일이 아니면 검증이 안 된다.
 *
 * 그래서 실제 첨부를 고정 파일로 커밋해 뒀다 (`test/fixtures/unit-list.xlsx`, 32KB).
 * 전에는 `.cache`에만 있었는데 그건 커밋하지 않는 생성물이라, 이 파일에 달린 검사 7개가
 * 이 맥에서도 CI에서도 한 번도 돈 적이 없었다 (2026-09-22에 확인). 파서가 조용히 깨져도
 * 아무도 몰랐을 자리다.
 *
 * 내용은 LH가 공개한 공급주택 목록이다 (주소·면적·임대조건). 개인정보는 없다.
 * 공고가 바뀌어 파서를 고칠 때는 이 파일도 새 첨부로 갈아 끼운다.
 */
const REAL = fromRoot("collector", "test", "fixtures", "unit-list.xlsx");
describe.skipIf(!existsSync(REAL))("parseUnitList (실제 파일 2026-09-22)", () => {
  // describe 콜백은 skip 여부와 무관하게 수집 단계에서 실행된다. 파일 읽기를 여기 바로 두면
  // 파일이 없는 곳에서 skip이 걸리기도 전에 수집이 터진다 — 실제로 이 파일은 아무 데서도 안 돌고 있었다.
  let units: ReturnType<typeof parseUnitList>;
  beforeAll(() => {
    units = parseUnitList(readFileSync(REAL));
  });

  it("공고문이 말한 총 호수만큼 읽는다", () => {
    expect(units).toHaveLength(81);
  });

  it("주소와 동·호를 나눠 읽는다", () => {
    const first = units[0]!;
    expect(first.address).toContain("서울특별시 강동구 구천면로 317");
    expect(first.ho).toBe("403");
    expect(first.id).toContain("403");
  });

  it("면적·방수·층수·승강기", () => {
    const first = units[0]!;
    expect(first.exclusive_area_m2).toBeCloseTo(47.84, 2);
    expect(first.rooms).toBe(2);
    expect(first.floor).toBe(4);
    expect(first.elevator).toBe(true);
    expect(first.housing_form).toBe("연립주택");
  });

  it("임대조건은 첫 구간(수급자 등 기본)을 쓴다", () => {
    expect(units[0]!.deposit).toBe(25_289_000);
    expect(units[0]!.monthly_rent).toBe(476_370);
  });

  it("같은 건물의 다른 세대가 서로 다른 id를 갖는다", () => {
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
  });

  it("모든 집에 주소가 있다 — 주소 없는 행은 합계·안내문이라 걸러진다", () => {
    expect(units.every((u) => /[시군구]/.test(u.address))).toBe(true);
  });

  it("주소는 집 수보다 적다 — 한 건물에 여러 세대가 있다", () => {
    expect(new Set(units.map((u) => u.address)).size).toBeLessThan(units.length);
  });
});
