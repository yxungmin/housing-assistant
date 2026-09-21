/**
 * "그 밖의 조건"에 낼 문장만 남긴다.
 *
 * `notes`는 추출이 구조화하지 못한 공고문 조건을 담는 자리인데, 모델이 자기 작업 메모를
 * 같이 적어 보낸다. 실제로 화면에 이런 문장이 나갔다:
 *
 *   "정확한 일자가 없어 move_in은 null로 둠."
 *   "거주지 요건은 '과천시'(시군구)이나 스키마의 residence는 시도 코드 기준이므로 …"
 *   "해당 일반공급 물량은 두 계층 트랙에 중복 기재됨."
 *
 * 추출 프롬프트에 넣지 말라고 적어 두었지만 그건 부탁이지 보장이 아니다. 모델이 지키지 않는 날
 * 사용자가 그 문장을 본다. 그래서 내보내는 쪽에서 한 번 더 거른다.
 *
 * 메모 전체를 버리지 않고 문장 단위로 뺀다. 위 첫 예시의 앞 문장("입주는 2026년 5월로 예정")은
 * 사용자가 알아야 할 내용이고, 뒤 문장만 우리 사정이다. 통째로 버리면 쓸모 있는 것까지 사라진다.
 */

/** 우리 필드 이름 같은 것. move_in, applies_to, unit_types, rule_groups … */
const FIELD_NAME = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/;

/** 우리가 쓰는 말이지 공고문의 말이 아니다 */
const OUR_WORDS = /스키마|필드|파싱|JSON|트랙|null|매핑|코드 기준|기재함|기재됨|으로 둠|로 판단함|생성하지 않음/;

const isOurs = (sentence: string): boolean => FIELD_NAME.test(sentence) || OUR_WORDS.test(sentence);

/**
 * 문장 단위로 자른다. 한국어 공고문은 "…함.", "…음.", "…임." 처럼 마침표로 끝나고
 * 괄호 쪽수 표기가 마침표 앞에 붙는다("(p.4)."). 그래서 "p.4" 같은 약어 마침표에서 자르지 않도록
 * 마침표 뒤에 공백이 오는 자리에서만 나눈다.
 */
function sentences(note: string): string[] {
  return note
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 사용자에게 낼 메모만. 남는 문장이 없으면 그 메모는 통째로 빠진다.
 * 화면은 여기서 나온 것만 보여 주고, 빈 배열이면 "그 밖의 조건" 섹션 자체를 숨긴다.
 */
export function userFacingNotes(notes: string[] | undefined): string[] {
  if (!notes?.length) return [];
  const out: string[] = [];
  for (const note of notes) {
    const kept = sentences(note).filter((s) => !isOurs(s));
    if (kept.length > 0) out.push(kept.join(" "));
  }
  return out;
}
