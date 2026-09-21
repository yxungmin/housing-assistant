import { z } from "zod";

/**
 * 자격 룰 category. 각 category는 사용자 프로필의 필드와 1:1로 대응한다.
 * 대응 필드가 없거나 값이 비어 있으면 매칭 엔진은 NEEDS_CHECK로 처리한다.
 */
export const RuleCategory = z.enum([
  "income", // 가구 월평균소득 (원/월, 세전)
  "asset", // 총자산 (원)
  "car_value", // 자동차 가액 (원)
  "debt", // 기존 부채 월 상환액 (원/월)
  "residence", // 거주 지역 (법정동 코드 앞자리 등)
  "housing", // 무주택 기간 (개월)
  "marriage", // 혼인 기간 (년) 또는 예비신혼부부 여부
  "children", // 자녀 수 / 자녀 나이
  "age", // 나이 (만)
  "subscription", // 청약통장 가입기간(개월) / 납입횟수
  "commute", // 직장까지 대중교통 시간 (분) — 사용자가 정한 상한
  "status", // 계층 자격 (대학생·수급자·국가유공자 등). value = SpecialStatus 배열, operator in
]);
export type RuleCategory = z.infer<typeof RuleCategory>;

/**
 * 나이·소득 같은 숫자로 표현되지 않는 계층 자격. 프로필의 statuses(다중 선택)와 대응한다.
 * 프로필 statuses가 undefined면 NEEDS_CHECK, 빈 배열(해당 없음)이면 MISMATCH.
 */
export const SpecialStatus = z.enum([
  "student", // 대학생 (재학·입학·복학 예정)
  "job_seeker", // 취업준비생 (졸업·중퇴 2년 이내)
  "new_worker", // 사회초년생 (소득 있는 업무 5년 이내)
  "artist", // 예술인 (예술인복지법)
  "welfare_recipient", // 주거급여 수급자
  "basic_livelihood", // 생계·의료급여 수급자
  "national_merit", // 국가유공자 등
  "disabled", // 장애인 등록
  "nk_defector", // 북한이탈주민
  "single_parent_support", // 한부모가족 지원대상
  "elderly_care", // 65세 이상 직계존속 부양
  "care_leaver", // 아동복지시설 퇴소자 등
  "creator", // 창작자 (특화형 매입임대)
]);
export type SpecialStatus = z.infer<typeof SpecialStatus>;

/**
 * 프로필 값과 룰 값을 비교하는 연산자. value의 JSON 형태는 연산자에 따라 다르다.
 *  - eq / lte / gte : number | string
 *  - between        : [min, max]
 *  - in             : string[] | number[]
 *  - is_true        : true
 */
export const RuleOperator = z.enum(["eq", "lte", "gte", "between", "in", "is_true"]);
export type RuleOperator = z.infer<typeof RuleOperator>;

/** 같은 group 안의 룰을 어떻게 합치는가. any_of = 하나만 맞아도 통과. */
export const GroupMode = z.enum(["all_of", "any_of"]);
export type GroupMode = z.infer<typeof GroupMode>;

/** 공급 유형 (LH 공고 유형 코드 → enum 매핑 결과) */
export const HousingType = z.enum([
  "happy", // 행복주택
  "national_rental", // 국민임대
  "newlywed_hope", // 신혼희망타운
  "purchased_rental", // 매입임대 (청년·신혼부부 매입임대 등)
  "public_sale", // 공공분양
  "long_term_rental", // 장기전세·통합공공임대 등
  "other",
]);
export type HousingType = z.infer<typeof HousingType>;

export const PricingKind = z.enum(["rental", "sale"]);
export type PricingKind = z.infer<typeof PricingKind>;

export const VersionStatus = z.enum(["UNVERIFIED", "VERIFIED", "CONFLICT"]);
export type VersionStatus = z.infer<typeof VersionStatus>;

export const MatchStatus = z.enum(["MATCH", "MISMATCH", "NEEDS_CHECK"]);
export type MatchStatus = z.infer<typeof MatchStatus>;

export const MarriageStatus = z.enum(["single", "married", "pre_marriage", "single_parent"]);
export type MarriageStatus = z.infer<typeof MarriageStatus>;

export const IncomeType = z.enum(["single", "dual"]);
export type IncomeType = z.infer<typeof IncomeType>;

/**
 * 주변 생활 인프라 종류. Kakao Local 카테고리 코드와 1:1로 대응한다 (collector/src/geo/kakao.ts).
 * 살 집을 고를 때 실제로 묻는 것만 둔다 — 종류를 늘리면 화면이 지도 앱 흉내를 내기 시작한다.
 */
export const NearbyKind = z.enum(["daycare", "school", "mart", "convenience", "hospital", "park"]);
export type NearbyKind = z.infer<typeof NearbyKind>;
