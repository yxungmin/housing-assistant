/** 금액·날짜 표기. 화면의 모든 숫자는 여기서 나온다. */
export function won(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 1,142만 원 / 5억 7,120만 원 식의 한국식 축약 */
export function manwon(n: number | undefined | null): string {
  if (n === undefined || n === null) return "-";
  const v = Math.round(n);
  if (v === 0) return "0원";
  const eok = Math.floor(v / 100_000_000);
  const man = Math.round((v % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString("ko-KR")}만 원` : `${eok}억 원`;
  if (man > 0) return `${man.toLocaleString("ko-KR")}만 원`;
  return `${v.toLocaleString("ko-KR")}원`;
}

/** 개월 수 → "5년" / "5년 3개월" / "8개월" */
export function yearsMonths(months: number | undefined | null): string {
  const m = Math.max(0, Math.round(months ?? 0));
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (y === 0) return `${r}개월`;
  return r ? `${y}년 ${r}개월` : `${y}년`;
}

export function pct(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined) return "-";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function daysUntil(dateIso: string | undefined, now = new Date()): number | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T23:59:59+09:00`);
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

export function dday(dateIso: string | undefined): string {
  const d = daysUntil(dateIso);
  if (d === null) return "";
  if (d < 0) return "마감";
  if (d === 0) return "오늘 마감";
  return `D-${d}`;
}

/** "2026-09-30" → "9.30" */
export function shortDate(iso: string | undefined): string {
  if (!iso) return "?";
  const [, m, d] = iso.split("-");
  return `${Number(m)}.${Number(d)}`;
}

export function longDate(iso: string | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

export const HOUSING_LABEL: Record<string, string> = {
  happy: "행복주택",
  national_rental: "국민임대",
  newlywed_hope: "신혼희망타운",
  purchased_rental: "매입임대",
  public_sale: "공공분양",
  long_term_rental: "공공임대",
  other: "기타",
};

export const CATEGORY_LABEL: Record<string, string> = {
  income: "소득",
  asset: "총자산",
  car_value: "자동차",
  debt: "부채",
  residence: "거주지",
  housing: "무주택",
  marriage: "혼인",
  children: "자녀",
  age: "나이",
  subscription: "청약통장",
  commute: "통근",
};
