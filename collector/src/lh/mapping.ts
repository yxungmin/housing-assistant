import type { HousingType } from "@housing/schema";

/**
 * LH 공고 유형명(UPP_AIS_TP_NM / AIS_TP_CD_NM) → HousingType.
 * 결정론적 매핑. 미지 값은 "other"로 두고 원본을 로그에 남긴다 (문서: 단계별 규칙 — API 메타 매핑).
 * 실제 코드 값은 M1에서 `npm run lh:dump`로 확인해 이 표에 한 줄씩 추가한다.
 */
const HOUSING_TYPE_BY_KEYWORD: [RegExp, HousingType][] = [
  [/신혼희망타운/, "newlywed_hope"],
  [/행복주택/, "happy"],
  [/국민임대/, "national_rental"],
  [/매입임대|전세임대|집주인\s*임대/, "purchased_rental"], // 집주인임대(주거복지)는 V0.1에서 매입임대 계열로 취급
  [/공공분양|분양주택|신혼희망.*분양/, "public_sale"],
  [/장기전세|통합공공임대|영구임대|공공임대/, "long_term_rental"],
];

export interface MappingResult {
  housing_type: HousingType;
  /** 매핑 표에 없어 other로 떨어진 경우 원본 문자열 */
  unknown?: string;
}

export function mapHousingType(...labels: (string | undefined)[]): MappingResult {
  const joined = labels.filter(Boolean).join(" ");
  for (const [re, type] of HOUSING_TYPE_BY_KEYWORD) {
    if (re.test(joined)) return { housing_type: type };
  }
  return { housing_type: "other", unknown: joined || "(빈 값)" };
}

/** LH 지역명 → 시도 코드 (행정표준코드 앞 2자리) */
const REGION_CODE_BY_NAME: Record<string, string> = {
  전남광주통합특별시: "46", // 2026 통합시 표기 (실제 API 값). 광주 단독 표기는 아래 29
  서울: "11",
  부산: "26",
  대구: "27",
  인천: "28",
  광주: "29",
  대전: "30",
  울산: "31",
  세종: "36",
  경기: "41",
  강원: "42",
  충북: "43",
  충청북도: "43",
  충남: "44",
  충청남도: "44",
  전북: "45",
  전라북도: "45",
  전남: "46",
  전라남도: "46",
  경북: "47",
  경상북도: "47",
  경남: "48",
  경상남도: "48",
  제주: "50",
};

export function mapRegionCode(name: string | undefined): { region_code: string; unknown?: string } {
  if (!name) return { region_code: "00", unknown: "(빈 값)" };
  for (const [key, code] of Object.entries(REGION_CODE_BY_NAME)) {
    if (name.startsWith(key)) return { region_code: code };
  }
  if (/전국|기타/.test(name)) return { region_code: "00" };
  return { region_code: "00", unknown: name };
}

/** "20260901" 또는 "2026.09.01" 또는 "2026-09-01" → "2026-09-01" */
export function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 8) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
