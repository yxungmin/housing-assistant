/**
 * 끌어서 고르는 막대의 셈.
 *
 * 화면에서 떼어 둔다 — 손가락이 어디에 닿았는지를 얼마로 읽을 것인가는 순수한 계산이고,
 * 그 계산이 틀리면 사용자는 자기가 고른 적 없는 보증금으로 월세를 본다.
 */

/**
 * 눈금에 붙인다.
 *
 * 눈금은 **최소값에서** 시작한다. 100만 원의 배수에 맞추면 안 된다 —
 * 공고의 최소 보증금이 배수가 아닌 경우(예: 1,234만 원)에 최소값 아래로 떨어진다.
 *
 * 맨 끝은 눈금이 아니라 최대값 그대로다. 최대 보증금이 최소값 + 100만 원의 배수가 아니면
 * (LH 공고에서 흔하다 — 상한이 기준임대보증금 비율로 정해진다) 눈금만 써서는
 * 최대 전환을 **고를 수 없다.** 그게 이 화면에서 사람들이 가장 자주 보려는 값이다.
 */
export function snapDeposit(value: number, min: number, max: number, step: number): number {
  if (max <= min) return min;
  const clamped = Math.min(max, Math.max(min, value));
  const grid = Math.min(max, min + Math.round((clamped - min) / step) * step);
  return Math.abs(clamped - max) < Math.abs(clamped - grid) ? max : grid;
}

/** 막대 위 x(px)를 보증금으로. 폭이 아직 0이면(첫 레이아웃 전) 최소값 — 0원을 만들지 않는다. */
export function depositAt(x: number, width: number, min: number, max: number, step: number): number {
  if (width <= 0) return min;
  return snapDeposit(min + (Math.min(1, Math.max(0, x / width)) * (max - min)), min, max, step);
}

/** 채워진 비율 (0~1). 고를 수 있는 폭이 없으면 가득 찬 것으로 본다 — 빈 막대는 고장으로 보인다. */
export function fillRatio(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
