/** 화면·게시물에 적는 공급 유형 이름. 앱(lib/format.ts)과 수집기(social/)가 같이 쓴다. */
export const HOUSING_LABEL: Record<string, string> = {
  happy: "행복주택",
  national_rental: "국민임대",
  newlywed_hope: "신혼희망타운",
  purchased_rental: "매입임대",
  public_sale: "공공분양",
  long_term_rental: "공공임대",
  other: "기타",
};

/**
 * 화면에 적는 공급 유형.
 *
 * 유형 코드는 수집기가 정하는데, long_term_rental 하나에 영구임대·장기전세·통합공공임대가 같이 들어간다.
 * 그래서 서울 영구임대와 SH 장기전세가 둘 다 "공공임대"로 보였고, 통합공공임대는 other라 "기타"였다.
 * 셋은 대상도 가격 구조도 전혀 다르다. 코드를 쪼개려면 수집기·DB·스키마를 같이 바꿔야 해서,
 * 우선 제목에 적힌 이름을 쓴다 — 기관이 제목에 유형을 빠뜨리는 일은 거의 없다.
 * 앞에 둔 것이 먼저 걸린다("영구임대주택 입주자격완화"는 영구임대).
 */
const TITLE_KINDS: [RegExp, string][] = [
  [/영구임대/, "영구임대"],
  [/장기전세/, "장기전세"],
  [/통합공공임대/, "통합공공임대"],
  [/전세임대/, "전세임대"],
  [/국민임대/, "국민임대"],
  [/행복주택/, "행복주택"],
  [/신혼희망타운/, "신혼희망타운"],
  [/매입임대/, "매입임대"],
];

export function housingLabel(a: { housing_type: string; title?: string }): string {
  const code = HOUSING_LABEL[a.housing_type] ?? "기타";
  // 코드가 구체적이면 코드를 믿는다. 뭉뚱그린 코드(공공임대·기타)일 때만 제목을 본다
  if (a.housing_type !== "long_term_rental" && a.housing_type !== "other") return code;
  const hit = TITLE_KINDS.find(([re]) => re.test(a.title ?? ""));
  return hit ? hit[1] : code;
}
