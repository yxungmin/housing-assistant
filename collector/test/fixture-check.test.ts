import { describe, expect, it } from "vitest";
import type { ExtractionOutput } from "@housing/schema";
import { checkCase } from "../src/fixture-check";
import type { PdfPage } from "../src/pdf/extract";

/** 실제 공고문과 같은 모양으로 줄바꿈·표를 섞은 가짜 2쪽. */
const pages: PdfPage[] = [
  {
    page: 1,
    text: [
      "가 신청자격",
      "➜ 입주자 모집 공고일(2026.8.31.) 현재 서울특별시에 거주하는 성년자인 무주택세대구성원",
      "○ 민법상 미성년자(만19세 미만)·외국인은 신청할 수 없습니다.",
      "○ 자동차가액 4,542만원 이하",
    ].join("\n"),
  },
  {
    page: 2,
    text: [
      "[임대조건]",
      "단지명 주택형 세대수 임대보증금(천원)",
      "세곡2지구 59 22 514,020",
      "수서하니움 45 1 377,520",
      // 표는 칸 단위로 뽑혀 나와서 한 행이 한 줄로 이어지지 않는다
      "가구원수별 가구당 월평균소득",
      "1인가구 2인가구",
      "70% 2,669,354원 4,106,389원",
    ].join("\n"),
  },
];

const rule = (over: Partial<ExtractionOutput["tracks"][0]["rules"][0]> = {}) => ({
  group_id: "g",
  category: "age" as const,
  applies_to: {},
  operator: "gte" as const,
  value: 19,
  unit: "years",
  source: { page: 1, text: "민법상 미성년자(만19세 미만)·외국인은 신청할 수 없습니다." },
  confidence: 0.9,
  verified: false,
  ...over,
});

const build = (rules: ReturnType<typeof rule>[], pricing: ExtractionOutput["tracks"][0]["pricing"] = []): ExtractionOutput => ({
  title: "테스트 공고",
  housing_type: "long_term_rental",
  schedule: {},
  tracks: [{ name: "일반공급", unit_types: [{ name: "59" }], rule_groups: [{ id: "g", mode: "all_of", label: "기본" }], rules, pricing }],
  notes: [],
});

const only = (x: ExtractionOutput) => checkCase(x, pages)[0]!;

describe("fixture-check", () => {
  it("인용문이 그 쪽에 그대로 있으면 통과", () => {
    expect(only(build([rule()]))).toMatchObject({ severity: "ok", codes: [] });
  });

  it("줄바꿈·공백이 달라도 통과 (PDF 텍스트는 원문과 띄어쓰기가 다르다)", () => {
    const f = only(build([rule({ source: { page: 1, text: "입주자 모집  공고일(2026.8.31.)\n현재 서울특별시에 거주하는 성년자인 무주택세대구성원" }, category: "residence", operator: "in", value: ["11"], unit: "region_code" })]));
    expect(f.severity).toBe("ok");
  });

  it("인용 쪽이 틀리면 실제 쪽을 알려 준다", () => {
    const f = only(build([rule({ source: { page: 2, text: "민법상 미성년자(만19세 미만)·외국인은 신청할 수 없습니다." } })]));
    expect(f.severity).toBe("bad");
    expect(f.codes).toContain("page_mismatch");
    expect(f.detail).toContain("p.1");
  });

  it("원문에 없는 근거를 지어내면 잡는다", () => {
    const f = only(build([rule({ source: { page: 1, text: "만 39세 이하인 청년에 한하여 신청할 수 있습니다" }, operator: "lte", value: 39 })]));
    expect(f.severity).toBe("bad");
    expect(f.codes).toContain("quote_missing");
  });

  it("표의 한 행을 문장으로 재구성한 인용은 지어낸 것과 구분한다", () => {
    const f = only(build([rule({ category: "income", operator: "lte", value: 2_669_354, unit: "KRW_monthly", source: { page: 2, text: "70% 1인가구 2,669,354원" } })]));
    expect(f.severity).toBe("warn");
    expect(f.codes).toContain("quote_reconstructed");
  });

  it("값이 한 자리만 달라도 잡는다", () => {
    const f = only(build([rule({ category: "income", operator: "lte", value: 2_769_354, unit: "KRW_monthly", source: { page: 2, text: "70% 1인가구 2,669,354원" } })]));
    expect(f.severity).toBe("bad");
    expect(f.codes).toContain("value_unsupported");
  });

  it("만원 단위 표기를 원 단위 값과 맞춘다 (4,542만원 ↔ 45420000)", () => {
    const f = only(build([rule({ category: "car_value", operator: "lte", value: 45_420_000, unit: "KRW", source: { page: 1, text: "자동차가액 4,542만원 이하" } })]));
    expect(f.severity).toBe("ok");
  });

  it("천원 단위 가격표를 원 단위 값과 맞춘다 (514,020천원 ↔ 514020000)", () => {
    const f = checkCase(build([], [{ unit_type: "59", kind: "rental", deposit: 514_020_000, monthly_rent: 0, source: { page: 2, text: "세곡2지구 59 22 514,020" } }]), pages)[0]!;
    expect(f.codes).not.toContain("value_unsupported");
  });

  it("같은 쪽 다른 행의 금액으로 바뀌면 인용문 밖이라고 표시한다", () => {
    const f = checkCase(build([], [{ unit_type: "59", kind: "rental", deposit: 377_520_000, monthly_rent: 0, source: { page: 2, text: "세곡2지구 59 22 514,020" } }]), pages)[0]!;
    expect(f.codes).toContain("value_off_quote");
  });

  it("PDF 쪽수를 넘는 인용은 잡는다", () => {
    const f = only(build([rule({ source: { page: 99, text: "민법상 미성년자(만19세 미만)·외국인은 신청할 수 없습니다." } })]));
    expect(f.codes).toContain("page_out_of_range");
  });

  it("신뢰도가 낮으면 사람이 보도록 표시한다", () => {
    const f = only(build([rule({ confidence: 0.5 })]));
    expect(f.codes).toContain("low_confidence");
    expect(f.severity).toBe("warn");
  });
});
