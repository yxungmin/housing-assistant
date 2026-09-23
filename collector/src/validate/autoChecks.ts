import type { ExtractionOutput } from "@housing/schema";
import { categoryLabel, missingCategories } from "@housing/engine";

/**
 * 결정론적 자동 검증.
 *
 * 지적은 두 종류다. 자동 게시(사람 승인 없이 앱에 내보내기)를 도입하면서 나눴다.
 *  - blocking  숫자를 믿을 수 없다 → 게시하지 않는다 (CONFLICT). 사람이 봐야 한다.
 *  - advisory  값은 그럴듯한데 빠진 게 있다 → 게시하되 앱 화면에 그대로 알린다.
 * 모든 지적을 blocking으로 두면 "가격 정보 없음" 하나로 공고 전체가 사라져,
 * 자격이 되는 사람에게 공고를 감추게 된다. 그 오류는 아무도 신고하지 않는다.
 */
export interface AutoCheck {
  message: string;
  blocking: boolean;
}

export function autoChecks(
  x: ExtractionOutput,
  /**
   * 집 단위 공급(매입임대·든든전세)의 가격은 트랙이 아니라 **집마다** 붙는다.
   * 그걸 모르고 `track.pricing`만 보면 420채에 값이 다 있는 공고에도 "가격 정보 없음"이 뜬다.
   * 실제로 그랬다 (2026-09-23, 서울지역본부 청년매입임대).
   */
  opts: { unitPricing?: boolean } = {},
): AutoCheck[] {
  const issues: AutoCheck[] = [];
  const bad = (message: string) => issues.push({ message, blocking: true });
  const note = (message: string) => issues.push({ message, blocking: false });

  const { schedule } = x;
  if (schedule.apply_start && schedule.apply_end && schedule.apply_start > schedule.apply_end) {
    bad(`접수 시작(${schedule.apply_start})이 종료(${schedule.apply_end})보다 늦다`);
  }
  if (schedule.notice_date && schedule.apply_start && schedule.notice_date > schedule.apply_start) {
    bad(`공고일(${schedule.notice_date})이 접수 시작(${schedule.apply_start})보다 늦다`);
  }

  x.tracks.forEach((track, ti) => {
    const label = `tracks[${ti}] ${track.name}`;
    if (track.households !== undefined && track.unit_types.length > 0) {
      const sum = track.unit_types.reduce((acc, u) => acc + (u.households ?? 0), 0);
      const allKnown = track.unit_types.every((u) => u.households !== undefined);
      // 세대수는 조건·금액 판단을 바꾸지 않는다 → 알리기만 한다
      if (allKnown && sum !== track.households) {
        note(`${label}: 주택형 세대수 합계 ${sum} ≠ 트랙 세대수 ${track.households}`);
      }
    }
    for (const rule of track.rules) {
      if (rule.category === "income" && typeof rule.value === "number") {
        if (rule.value <= 0) bad(`${label}: 소득 상한이 0 이하 (${rule.value})`);
        if (rule.value > 50_000_000) bad(`${label}: 소득 상한이 비현실적으로 크다 (${rule.value}원/월) — 연소득을 월로 잘못 옮겼을 수 있음`);
        if (rule.value < 500_000) bad(`${label}: 소득 상한이 비현실적으로 작다 (${rule.value}원/월) — 만원 단위 누락 의심`);
      }
      if (rule.category === "age" && rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        if (min < 0 || max > 120) bad(`${label}: 나이 범위 이상 [${min}, ${max}]`);
      }
      // 신뢰도가 낮아도 값 자체는 그럴듯하다. 화면에서 "확인 필요"로 낮춰 보여 준다.
      if (rule.confidence < 0.5) note(`${label}: 룰 신뢰도 낮음 (${rule.category} ${rule.confidence})`);
    }
    for (const p of track.pricing) {
      if (p.kind === "rental") {
        if ((p.deposit ?? 0) === 0 && (p.monthly_rent ?? 0) === 0) bad(`${label}/${p.unit_type}: 보증금·월세가 모두 0`);
        if ((p.deposit ?? 0) > 3_000_000_000) bad(`${label}/${p.unit_type}: 보증금 30억 초과 — 단위 오류 의심`);
        if ((p.monthly_rent ?? 0) > 5_000_000) bad(`${label}/${p.unit_type}: 월임대료 500만 초과 — 단위 오류 의심`);
        if ((p.monthly_rent ?? 0) > 0 && (p.monthly_rent ?? 0) < 10_000) bad(`${label}/${p.unit_type}: 월임대료 1만 원 미만 — 단위 누락 의심`);
        if (p.conversion?.max_deposit !== undefined && p.deposit !== undefined && p.conversion.max_deposit < p.deposit) {
          bad(`${label}/${p.unit_type}: 전환 보증금 상한이 기본 보증금보다 작다`);
        }
      }
      if (p.kind === "sale" && (p.sale_price ?? 0) < 10_000_000) bad(`${label}/${p.unit_type}: 분양가 1천만 원 미만 — 단위 오류 의심`);
    }
    // 가격이 없으면 계산 화면만 닫히고 조건 매칭은 그대로 쓸 수 있다 → 알리기만 한다
    if (track.pricing.length === 0 && !opts.unitPricing) note(`${label}: 가격 정보 없음`);
  });
  /**
   * 빠진 조건. 위의 검사는 전부 **있는 값**을 본다 — 일정이 말이 되나, 세대수 합이 맞나.
   * 아예 안 뽑힌 조건은 그래서 안 걸리는데, 자격 판정에서 더 위험한 쪽은 그쪽이다.
   * 틀린 값은 화면에서 눈에 띄지만 빠진 조건은 "맞음"으로 조용히 넘어간다.
   *
   * blocking으로 두지 않는다. 그 트랙만의 특칙일 수도 있고, 이것 하나로 공고를 통째로
   * 감추면 우리가 못 읽었다는 사실조차 아무도 못 보게 된다. 대신 앱에 그대로 알린다 —
   * 앱은 같은 판단을 엔진의 siblingGuard로 한 번 더 하고, 이건 그 이유를 글로 보여 주는 쪽이다.
   */
  missingCategories(x).forEach((cats, ti) => {
    if (cats.length === 0) return;
    const name = x.tracks[ti]?.name ?? `tracks[${ti}]`;
    note(`${name}: ${cats.map(categoryLabel).join("·")}을 읽지 못했어요 (다른 공급 유형에는 있어요)`);
  });

  return issues;
}

/** 게시를 막는 지적만 */
export const blockingChecks = (x: AutoCheck[]): string[] => x.filter((i) => i.blocking).map((i) => i.message);
/** 게시하되 알리는 지적만 */
export const advisoryChecks = (x: AutoCheck[]): string[] => x.filter((i) => !i.blocking).map((i) => i.message);
