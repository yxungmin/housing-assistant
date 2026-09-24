import type { Maintenance } from "@housing/schema";

/**
 * 관리비 추정.
 *
 * 공고문에 관리비가 있는 일은 드물다. 그동안은 10만 원으로 고정했는데 전용 26㎡와 59㎡가 같을 리 없다.
 * 수집기가 K-apt(공동주택관리정보시스템)에서 단지의 실제 신고값, 또는 같은 구 단지들의 평균 단가를
 * 전용 1㎡당으로 받아 오면(Announcement.maintenance) 여기서 주택형의 전용면적을 곱한다.
 *
 * 순수 함수다. 네트워크·LLM 없이 기기에서 돈다.
 */
export interface MaintenanceEstimate {
  /** 월 관리비 합계 (공용 + 고지서에 포함된 사용료) */
  monthly: number;
  /** 공용관리비 (인건비·청소·경비·승강기·수선 등) */
  common: number;
  /** 개별사용료 (난방·전기·수도 등). 지역 평균에는 없다 */
  individual: number | null;
  area_m2: number;
  basis: Maintenance["basis"];
}

/** 천 원 단위. 관리비 추정치를 원 단위까지 적으면 정확한 것처럼 보인다 */
const toThousand = (v: number) => Math.round(v / 1000) * 1000;

export function estimateMaintenance(info: Maintenance | undefined, areaM2: number | undefined): MaintenanceEstimate | null {
  if (!info || areaM2 === undefined || !(areaM2 > 0)) return null;
  const common = toThousand(info.common_per_m2 * areaM2);
  const individual = info.individual_per_m2 !== undefined ? toThousand(info.individual_per_m2 * areaM2) : null;
  return { monthly: common + (individual ?? 0), common, individual, area_m2: areaM2, basis: info.basis };
}

/** 근거 한 줄. "2026-03" → "2026.3월" 꼴로 달을 적는다 */
export function maintenanceSourceLabel(info: Maintenance): string {
  const months = info.months.map((m) => `${m.slice(0, 4)}.${Number(m.slice(5, 7))}월`).join("·");
  return info.basis === "complex"
    ? `${info.complex ?? "이 단지"} 관리비 신고값 · ${months} · ${info.source}`
    : `${info.district ?? "같은 구"} ${info.sample ?? ""}개 단지${info.sample_households ? `(${info.sample_households[0].toLocaleString()}~${info.sample_households[1].toLocaleString()}세대, 이 공고와 비슷한 크기)` : ""} 단가 중앙값 · ${months} · ${info.source}`;
}
