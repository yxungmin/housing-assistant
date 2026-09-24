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
  let eok = Math.floor(v / 100_000_000);
  let man = Math.round((v % 100_000_000) / 10_000);
  // 9,999.6만 → 10,000만으로 반올림되면 억으로 올린다. 전에는 "1억 10,000만 원"이 나왔다 (2026-09-24 감사)
  if (man === 10_000) {
    eok += 1;
    man = 0;
  }
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

/**
 * 마감까지 며칠 남았나. 날짜 단위로 센다 — 오늘 마감이면 0, 내일이면 1이다.
 *
 * 시각 차이를 86,400,000으로 나누던 때는 오늘 마감이 0.6일로 나와 올림하면 1이 됐다.
 * 그래서 오늘 끝나는 공고에 "D-1"이 붙고 "오늘 마감"은 화면에 뜬 적이 없었다.
 * 사람이 세는 방식은 시각이 아니라 날짜다. 달력에서 며칠 뒤인지를 센다.
 */
export function daysUntil(dateIso: string | undefined, now = new Date()): number | null {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const end = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86_400_000);
}

// D-n 표시는 lib/phase.ts의 phaseLabel이 한다 — 마감일만 보면 접수 전 공고에도 D-n이 붙는다.

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
  // 같은 달이라고 일자만 남기면 "2026.09.28 ~ 30"이 되어 읽기 어렵다.
  // 달까지는 붙여 준다 — 연도만 생략해도 충분히 짧다.
  if (fm === tm) return `${dateText(from)} ~ ${pad(tm ?? "")}.${pad(td ?? "")}`;
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

// 공급 유형 이름은 엔진 한 곳에 둔다 — 수집기(인스타 대본)도 같은 이름을 써야 한다
export { HOUSING_LABEL, housingLabel } from "@housing/engine";

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

/**
 * 큰 금액을 한글로 읽어 준다: 43,520,000 → "4천3백52만 원".
 *
 * 숫자만 있으면 자릿수를 세어야 한다. "43,520,000원"과 "4,352,000원"은 쉼표 위치 하나 차이인데
 * 열 배가 다르고, 사람은 그 자리에서 잘못 읽는다. 보증금이나 대출금처럼 한 번 잘못 읽으면
 * 판단이 통째로 어긋나는 자리라, 원래 숫자 아래에 읽는 법을 작게 같이 적는다.
 *
 * 천 원 아래는 버린다. 34,816,000원의 "6천 원"은 이 화면에서 아무 판단도 바꾸지 않고
 * 한글 줄만 길게 만든다. 버림이라 실제 금액이 이 값보다 적어 보이는 일은 없다.
 */
export function koreanWon(n: number | undefined | null): string {
  if (n === undefined || n === null) return "";
  const man = Math.floor(Math.abs(n) / 10_000);
  if (man === 0) return "";
  // 본문 금액이 쓰는 빼기 기호와 같은 글자를 쓴다. 하이픈과 섞이면 한 줄 안에서 두 모양이 보인다.
  const sign = n < 0 ? "−" : "";

  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (rest > 0) {
    const thousand = Math.floor(rest / 1000);
    const hundred = Math.floor((rest % 1000) / 100);
    const tail = rest % 100;
    // 4352 → "4천3백52", 6200 → "6천2백", 81 → "81". 끝 두 자리는 그냥 숫자로 읽는 게 자연스럽다.
    const text = `${thousand > 0 ? `${thousand}천` : ""}${hundred > 0 ? `${hundred}백` : ""}${tail > 0 ? String(tail) : ""}`;
    parts.push(`${text}만`);
  }
  return `${sign}${parts.join(" ")} 원`;
}
