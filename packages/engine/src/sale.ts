import type { Pricing, UserProfile } from "@housing/schema";

/**
 * 분양(sale) 납부 계획. 공공분양·신혼희망타운은 분양가를 한 번에 내지 않고
 * 계약금 → 중도금 → 잔금으로 나눠 낸다. 사용자가 실제로 묻는 것은
 * "지금 당장 얼마가 있어야 계약이 되는가"이므로 계약금을 앞에 세운다.
 *
 * 비율은 공고문에서 추출한 payment_schedule만 쓴다. 표준 비율을 짐작해 채우지 않는다.
 * 공고마다 계약금 10%·20%가 갈리고 중도금 회차도 다르다. 없는 숫자를 만들면
 * "모든 숫자에 출처" 원칙이 깨진다 → 일정이 없으면 has_schedule=false로 알린다.
 *
 * 중도금 대출(집단대출)과 잔금 주택담보대출은 V0.1 범위 밖이다.
 * loan_products에는 전세자금대출(rental_deposit)만 있어서 계산할 근거가 없다.
 * 화면에는 "중도금 대출 조건은 공고문을 보세요"로 남긴다.
 */
export interface SaleInstallment {
  label: string;
  ratio: number;
  amount: number;
  due?: string;
  /** 계약금·중도금·잔금 중 무엇으로 분류했는가 */
  stage: "contract" | "interim" | "balance" | "other";
}

export interface SaleCost {
  sale_price: number;
  /** 공고문에서 읽은 납부 일정이 있는가. 없으면 아래 금액은 0이고 분양가만 믿을 수 있다. */
  has_schedule: boolean;
  installments: SaleInstallment[];
  contract_payment: number;
  interim_total: number;
  balance_payment: number;
  /** 계약하려면 지금 있어야 하는 현금 = 계약금 */
  required_cash: number;
  /** 보유 현금으로 계약금을 못 채우는 금액 */
  shortfall: number;
  /** 비율 합계. 1에서 크게 벗어나면 추출이 불완전하다는 신호 */
  ratio_sum: number;
  sources: { label: string; detail: string }[];
}

/** 공고문 표기에서 단계를 읽는다. 라벨은 "계약금", "중도금 1회차", "잔금" 형태로 온다. */
export function stageOf(label: string): SaleInstallment["stage"] {
  if (/계약금/.test(label)) return "contract";
  if (/중도금/.test(label)) return "interim";
  if (/잔금/.test(label)) return "balance";
  return "other";
}

/** 분양 공고 1건(주택형 1개)의 납부 계획. */
export function computeSaleCost(pricing: Pricing, profile: UserProfile): SaleCost {
  if (pricing.kind !== "sale") throw new Error("computeSaleCost는 분양(sale)만 받는다");
  const salePrice = pricing.sale_price ?? 0;
  const schedule = pricing.payment_schedule ?? [];

  const installments: SaleInstallment[] = schedule.map((s) => ({
    label: s.label,
    ratio: s.ratio,
    amount: Math.round(salePrice * s.ratio),
    due: s.due,
    stage: stageOf(s.label),
  }));
  const sumBy = (stage: SaleInstallment["stage"]) =>
    installments.filter((i) => i.stage === stage).reduce((a, i) => a + i.amount, 0);

  const contract = sumBy("contract");
  const interim = sumBy("interim");
  const balance = sumBy("balance");
  const ratioSum = installments.reduce((a, i) => a + i.ratio, 0);

  const sources: SaleCost["sources"] = [{ label: "분양가", detail: `공고문 ${pricing.source.page}쪽` }];
  if (installments.length > 0) sources.push({ label: "납부 일정", detail: `공고문 ${pricing.source.page}쪽` });
  else sources.push({ label: "납부 일정", detail: "공고문에서 읽지 못했어요" });
  sources.push({ label: "중도금·잔금 대출", detail: "공고문의 대출 안내를 보세요" });

  return {
    sale_price: salePrice,
    has_schedule: installments.length > 0,
    installments,
    contract_payment: contract,
    interim_total: interim,
    balance_payment: balance,
    required_cash: contract,
    shortfall: Math.max(0, contract - (profile.cash_on_hand ?? 0)),
    ratio_sum: Number(ratioSum.toFixed(4)),
    sources,
  };
}
