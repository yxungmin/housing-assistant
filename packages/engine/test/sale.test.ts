import { describe, expect, it } from "vitest";
import type { Pricing, UserProfile } from "@housing/schema";
import { computeSaleCost, stageOf } from "../src/index";

const src = { page: 12, text: "분양가 및 납부일정" };

const profile: UserProfile = { cash_on_hand: 60_000_000 };

/** 분양가 4억 8천, 계약금 10% · 중도금 60%(6회) · 잔금 30% */
const sale: Pricing = {
  unit_type: "59A",
  kind: "sale",
  sale_price: 480_000_000,
  payment_schedule: [
    { label: "계약금", ratio: 0.1, due: "2026-11-10" },
    ...Array.from({ length: 6 }, (_, i) => ({ label: `중도금 ${i + 1}회차`, ratio: 0.1, due: `2027-0${i + 1}-10` })),
    { label: "잔금", ratio: 0.3, due: "입주지정일" },
  ],
  source: src,
};

describe("stageOf", () => {
  it("라벨에서 단계를 읽는다", () => {
    expect(stageOf("계약금")).toBe("contract");
    expect(stageOf("중도금 3회차")).toBe("interim");
    expect(stageOf("잔금")).toBe("balance");
    expect(stageOf("발코니 확장비")).toBe("other");
  });
});

describe("computeSaleCost", () => {
  it("분양가를 비율대로 나눠 단계별로 합친다", () => {
    const c = computeSaleCost(sale, profile);
    expect(c.sale_price).toBe(480_000_000);
    expect(c.contract_payment).toBe(48_000_000);
    expect(c.interim_total).toBe(288_000_000);
    expect(c.balance_payment).toBe(144_000_000);
    expect(c.contract_payment + c.interim_total + c.balance_payment).toBe(480_000_000);
    expect(c.installments).toHaveLength(8);
    expect(c.ratio_sum).toBe(1);
  });

  it("계약에 필요한 현금은 계약금이고 부족액을 함께 준다", () => {
    const c = computeSaleCost(sale, profile);
    expect(c.required_cash).toBe(48_000_000);
    expect(c.shortfall).toBe(0); // 보유 6,000만 > 계약금 4,800만
    expect(computeSaleCost(sale, { cash_on_hand: 30_000_000 }).shortfall).toBe(18_000_000);
    expect(computeSaleCost(sale, {}).shortfall).toBe(48_000_000); // 현금 미입력
  });

  it("납부 일정이 없으면 만들어 내지 않고 알린다", () => {
    const c = computeSaleCost({ ...sale, payment_schedule: undefined }, profile);
    expect(c.has_schedule).toBe(false);
    expect(c.installments).toEqual([]);
    expect(c.contract_payment).toBe(0);
    expect(c.sale_price).toBe(480_000_000);
    expect(c.sources.some((s) => s.detail.includes("읽지 못했"))).toBe(true);
  });

  it("비율 합계가 1이 아니면 그대로 드러낸다", () => {
    const partial: Pricing = { ...sale, payment_schedule: [{ label: "계약금", ratio: 0.2 }] };
    const c = computeSaleCost(partial, profile);
    expect(c.ratio_sum).toBe(0.2);
    expect(c.contract_payment).toBe(96_000_000);
  });

  it("출처에 공고문 쪽수와 대출 안내를 남긴다", () => {
    const c = computeSaleCost(sale, profile);
    expect(c.sources[0]).toEqual({ label: "분양가", detail: "공고문 12쪽" });
    expect(c.sources.some((s) => s.label === "중도금·잔금 대출")).toBe(true);
  });

  it("임대를 넣으면 거부한다", () => {
    const rental: Pricing = { unit_type: "16A", kind: "rental", deposit: 1000, monthly_rent: 10, source: src };
    expect(() => computeSaleCost(rental, profile)).toThrow(/분양\(sale\)만/);
  });
});
