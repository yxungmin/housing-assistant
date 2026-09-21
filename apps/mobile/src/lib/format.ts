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

/**
 * 잠긴 값. 자릿수와 쉼표는 남기고 숫자만 가린다 — 빈칸이면 "뭘 사는 건지" 알 수 없고,
 * 자릿수가 보이면 가려진 게 비어 있지 않다는 증거가 된다 (통행료가 아니라 궁금증이 되게).
 * 가짜 숫자를 보여 주지는 않는다.
 */
export function maskDigits(text: string): string {
  return text.replace(/\d/g, "•");
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

/** 문장 안에서 쓰는 날짜: "2026년 9월 30일" */
export function longDate(iso: string | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

const pad = (v: string) => v.padStart(2, "0");

/**
 * 표에서 쓰는 날짜: "2026.09.30".
 * 표 안에서는 자릿수가 맞아야 눈이 세로로 읽는다 (문장 안이면 longDate).
 */
export function dateText(iso: string | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  if (!y || !m) return iso;
  return d ? `${y}.${pad(m)}.${pad(d)}` : `${y}.${pad(m)}`;
}

/** 기간: "2026.09.29 ~ 10.01". 같은 해면 뒤쪽 연도를 생략한다 */
export function dateRange(from: string | undefined, to: string | undefined): string {
  if (!from && !to) return "-";
  if (!from) return `~ ${dateText(to)}`;
  if (!to) return `${dateText(from)} ~`;
  const [fy, fm] = from.split("-");
  const [ty, tm, td] = to.split("-");
  if (fy !== ty) return `${dateText(from)} ~ ${dateText(to)}`;
  if (fm === tm) return `${dateText(from)} ~ ${pad(td ?? "")}`;
  return `${dateText(from)} ~ ${pad(tm ?? "")}.${pad(td ?? "")}`;
}

/**
 * 공고문에서 온 날짜는 형태가 제각각이다 — "2027-02-18", "2027-02",
 * 그리고 "공가 발생 시 개별 안내" 같은 문장도 온다. 날짜면 맞추고, 아니면 그대로 둔다.
 */
export function looseDate(value: string | undefined): string {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateText(value);
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-");
    return `${y}년 ${Number(m)}월`;
  }
  return value;
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
