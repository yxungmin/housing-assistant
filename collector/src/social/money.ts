/**
 * 게시물의 금액 표기. 대본·캡션·재대조가 **같은 함수**를 쓴다 — 재대조는 이 함수로 사실을 적어 본 뒤
 * 대본의 숫자가 그 안에 있는지 본다. 표기가 두 벌이면 맞는 숫자도 틀렸다고 나온다.
 */

/**
 * 상한("이하") 금액. 만 원 아래는 **버린다** — 3,432,027원은 "343만".
 * 반올림하면 기준이 실제보다 높게 보여, 기준을 넘는 사람이 된다고 읽는다. 게시물은 그 방향으로 틀리면 안 된다.
 */
export function limitMan(won: number): string {
  return manText(Math.floor(won / 10_000));
}

/** 임대료 같은 금액. 만 원 단위로 반올림 (범위로만 쓴다) */
export function priceMan(won: number): string {
  // 0원이 아닌 소액이 "0만"으로 보이지 않게 최소 1만으로 적는다
  return manText(won > 0 ? Math.max(1, Math.round(won / 10_000)) : 0);
}

/** 만 원 단위 정수 → "3억 4,500만" / "343만" */
function manText(man: number): string {
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (eok > 0) return rest > 0 ? `${eok}억 ${rest.toLocaleString("ko-KR")}만` : `${eok}억`;
  return `${man.toLocaleString("ko-KR")}만`;
}

/** [최소, 최대] → "100만~1,000만". 같으면 하나만 */
export function rangeMan([lo, hi]: [number, number]): string {
  const a = priceMan(lo);
  const b = priceMan(hi);
  return a === b ? a : `${a}~${b}`;
}
