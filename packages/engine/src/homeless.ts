import type { UserProfile } from "@housing/schema";
import { monthsBetween } from "./match";

/**
 * 무주택 인정 기간.
 *
 * "무주택 몇 년인가요?"는 사람이 답하기 어려운 질문이다. 태어나서부터 세는 것도 아니고
 * 자취 시작일도 아니다. 청약 가점제의 규칙이 따로 있다:
 *
 *  - 만 30세가 되는 날부터 센다.
 *  - 다만 만 30세 전에 혼인했으면 혼인신고일부터 센다.
 *  - 중간에 집을 가졌다가 팔았으면 판 날부터 다시 센다.
 *
 * 그래서 묻지 않고 계산해서 보여 준다. 사람은 생년월일과 혼인 여부만 답하면 된다.
 *
 * 혼인신고일은 따로 받지 않는다. 혼인 기간(년)만 받으므로 혼인일을 "오늘에서 그만큼 뺀 날"로 본다.
 * 달 단위까지 맞지는 않는다. 그래서 이 값은 화면의 기본값이고, 사람이 고칠 수 있게 둔다 —
 * 우리가 센 달수를 확정처럼 말하지 않는다.
 *
 * 집을 판 날은 이 함수가 모른다. 화면이 물어서 더 늦은 쪽을 쓰면 된다.
 */
export interface HomelessBasis {
  /** 기산일 YYYY-MM-DD */
  from: string;
  /** 오늘까지의 개월 수 */
  months: number;
  /** 왜 그날부터인가 */
  reason: "age30" | "marriage";
  /** 기산일이 아직 오지 않았는가 (만 30세 전). 그러면 months는 0이고 화면 문구도 달라야 한다 */
  future: boolean;
}

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const plusYears = (isoDate: string, years: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  // 2월 29일생의 30년 뒤는 2월 28일이다. Date가 3월 1일로 넘기므로 같은 달 안에서 끝날로 눌러 둔다.
  const last = new Date(y + years, m, 0).getDate();
  return iso(new Date(y + years, m - 1, Math.min(d, last)));
};

const minusYears = (today: Date, years: number): string => iso(new Date(today.getFullYear() - years, today.getMonth(), today.getDate()));

/** 생년월일이 없으면 셀 수 없다. 그때는 null을 주고 화면이 직접 입력을 받는다. */
export function homelessBasis(
  profile: Pick<UserProfile, "birth_date" | "marriage" | "marriage_years">,
  today = new Date(),
): HomelessBasis | null {
  if (!profile.birth_date) return null;

  const thirty = plusYears(profile.birth_date, 30);
  const married = profile.marriage === "married" && profile.marriage_years !== undefined && profile.marriage_years > 0;
  const marriageDate = married ? minusYears(today, profile.marriage_years!) : null;

  // 만 30세 전에 혼인했으면 혼인일이 더 이르다. 그때만 혼인일을 쓴다.
  const useMarriage = marriageDate !== null && marriageDate < thirty;
  const from = useMarriage ? marriageDate! : thirty;

  return { from, months: monthsBetween(from, today), reason: useMarriage ? "marriage" : "age30", future: from > iso(today) };
}

/** 화면에 적을 한 줄. 왜 이 숫자인지 말하지 않으면 사람이 고쳐야 할지 알 수 없다. */
export function homelessBasisReason(basis: HomelessBasis): string {
  const [y, m] = basis.from.split("-");
  const when = `${y}년 ${Number(m)}월`;
  // 아직 만 30세가 안 됐으면 "셌어요"가 거짓말이 된다. 셀 것이 아직 없다.
  if (basis.future) return `만 30세가 되는 ${when}부터 쌓여요. 그전까지는 0이에요`;
  return basis.reason === "marriage" ? `만 30세 전에 혼인하셔서 혼인 시점(${when})부터 셌어요` : `만 30세가 된 ${when}부터 셌어요`;
}
