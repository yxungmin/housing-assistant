import type { ExtractionOutput } from "@housing/schema";

/**
 * 결정론적 자동 검증. 위반 항목은 CONFLICT 사유로 기록된다.
 * (문서: 소득 상한이 음수인가, 접수 시작<종료인가, 면적 합계와 세대수 정합성 등)
 */
export function autoChecks(x: ExtractionOutput): string[] {
  const issues: string[] = [];
  const { schedule } = x;
  if (schedule.apply_start && schedule.apply_end && schedule.apply_start > schedule.apply_end) {
    issues.push(`접수 시작(${schedule.apply_start})이 종료(${schedule.apply_end})보다 늦다`);
  }
  if (schedule.notice_date && schedule.apply_start && schedule.notice_date > schedule.apply_start) {
    issues.push(`공고일(${schedule.notice_date})이 접수 시작(${schedule.apply_start})보다 늦다`);
  }

  x.tracks.forEach((track, ti) => {
    const label = `tracks[${ti}] ${track.name}`;
    if (track.households !== undefined && track.unit_types.length > 0) {
      const sum = track.unit_types.reduce((acc, u) => acc + (u.households ?? 0), 0);
      const allKnown = track.unit_types.every((u) => u.households !== undefined);
      if (allKnown && sum !== track.households) {
        issues.push(`${label}: 주택형 세대수 합계 ${sum} ≠ 트랙 세대수 ${track.households}`);
      }
    }
    for (const rule of track.rules) {
      if (rule.category === "income" && typeof rule.value === "number") {
        if (rule.value <= 0) issues.push(`${label}: 소득 상한이 0 이하 (${rule.value})`);
        if (rule.value > 50_000_000) issues.push(`${label}: 소득 상한이 비현실적으로 크다 (${rule.value}원/월) — 연소득을 월로 잘못 옮겼을 수 있음`);
        if (rule.value < 500_000) issues.push(`${label}: 소득 상한이 비현실적으로 작다 (${rule.value}원/월) — 만원 단위 누락 의심`);
      }
      if (rule.category === "age" && rule.operator === "between" && Array.isArray(rule.value)) {
        const [min, max] = rule.value as [number, number];
        if (min < 0 || max > 120) issues.push(`${label}: 나이 범위 이상 [${min}, ${max}]`);
      }
      if (rule.confidence < 0.5) issues.push(`${label}: 룰 신뢰도 낮음 (${rule.category} ${rule.confidence})`);
    }
    for (const p of track.pricing) {
      if (p.kind === "rental") {
        if ((p.deposit ?? 0) === 0 && (p.monthly_rent ?? 0) === 0) issues.push(`${label}/${p.unit_type}: 보증금·월세가 모두 0`);
        if ((p.deposit ?? 0) > 3_000_000_000) issues.push(`${label}/${p.unit_type}: 보증금 30억 초과 — 단위 오류 의심`);
        if ((p.monthly_rent ?? 0) > 5_000_000) issues.push(`${label}/${p.unit_type}: 월임대료 500만 초과 — 단위 오류 의심`);
        if ((p.monthly_rent ?? 0) > 0 && (p.monthly_rent ?? 0) < 10_000) issues.push(`${label}/${p.unit_type}: 월임대료 1만 원 미만 — 단위 누락 의심`);
        if (p.conversion?.max_deposit !== undefined && p.deposit !== undefined && p.conversion.max_deposit < p.deposit) {
          issues.push(`${label}/${p.unit_type}: 전환 보증금 상한이 기본 보증금보다 작다`);
        }
      }
      if (p.kind === "sale" && (p.sale_price ?? 0) < 10_000_000) issues.push(`${label}/${p.unit_type}: 분양가 1천만 원 미만 — 단위 오류 의심`);
    }
    if (track.pricing.length === 0) issues.push(`${label}: 가격 정보 없음`);
  });
  return issues;
}
