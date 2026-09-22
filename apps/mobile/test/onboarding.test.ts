import { describe, expect, it } from "vitest";
import { CONDITION_GROUPS, stepLabel, STEP_IDS, STEPS, visibleSteps } from "../src/lib/onboarding";

/**
 * 단계 id를 바꿀 때 같이 고쳐야 하는 표가 둘 있다 — 라벨 표와 묶음 표.
 * 2026-09-22에 직장 단계를 검색으로 바꾸며 id가 workplace_place로 변했는데 둘 다 옛 id를
 * 들고 있었다. 라벨은 화면에 원시 id가 나오게 되고, 묶음은 그 항목을 "그 밖에"로 떨어뜨린다.
 * 둘 다 타입 오류가 아니라 조용히 잘못 보이는 종류라, 테스트로 고정한다.
 */
describe("단계 표들이 최신인가", () => {
  it("묶음에 적힌 id가 모두 실재한다", () => {
    const unknown = CONDITION_GROUPS.flatMap((g) => g.ids).filter((id) => !STEP_IDS.includes(id));
    expect(unknown).toEqual([]);
  });

  it("모든 단계가 어느 묶음에든 들어 있다 — 빠지면 '그 밖에'로 떨어진다", () => {
    const grouped = new Set(CONDITION_GROUPS.flatMap((g) => g.ids));
    // 안내 화면(skip-info)은 고칠 값이 없어 목록에 넣지 않는다
    const missing = STEPS.filter((s) => s.kind !== "skip-info" && !grouped.has(s.id)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it("모든 단계에 사람이 읽을 라벨이 있다 — 없으면 화면에 원시 id가 나온다", () => {
    const raw = STEPS.filter((s) => stepLabel(s) === s.id).map((s) => s.id);
    expect(raw).toEqual([]);
  });

  it("묶음 제목과 id에 중복이 없다", () => {
    const ids = CONDITION_GROUPS.flatMap((g) => g.ids);
    expect(new Set(ids).size).toBe(ids.length);
    const titles = CONDITION_GROUPS.map((g) => g.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("첫 온보딩은 핵심만 묻는다", () => {
  it("core 단계는 일곱 개다 — 처음에 스무 개를 물으면 목록을 보기도 전에 지친다", () => {
    expect(STEPS.filter((s) => s.core).map((s) => s.id)).toEqual([
      "region",
      "birth_date",
      "marriage",
      "household_size",
      "annual_income",
      "total_assets",
      "homeless",
    ]);
  });

  it("coreOnly면 core 단계만 나온다", () => {
    const shown = visibleSteps({ region_code: "11" }, { coreOnly: true });
    expect(shown.every((s) => s.core)).toBe(true);
  });

  it("coreOnly가 아니면 직장 검색도 나온다 — 내 조건 화면에서 고칠 수 있어야 한다", () => {
    const ids = visibleSteps({ region_code: "11" }).map((s) => s.id);
    expect(ids).toContain("workplace_place");
  });
});
