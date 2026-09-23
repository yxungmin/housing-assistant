import type { Announcement } from "@/data/announcements";
import { applyPhase } from "./phase";
import { hasSource } from "./source";

/**
 * 기관 사이트로 신청하러 가는 길.
 *
 * 공고문 보기(SourceCard)와는 일이 다르다. 그쪽은 "우리가 옮긴 숫자가 맞나"를 확인하는 길이라
 * 조건 바로 밑에 있고 PDF를 연다. 이쪽은 "해 볼 만하다"고 판단한 사람이 다음에 하는 일이라
 * 판단이 끝나는 자리(상세·예상 주거비 하단 버튼 바로 밑)에 둔다. 헤더 아이콘으로 숨기면 아무도 못 찾고,
 * 홈 카드에 두면 판단하기 전에 사람을 밖으로 내보낸다 — 이 앱은 판단하는 앱이다.
 *
 * 우리가 가진 주소는 기관의 공고 상세 페이지(detail_url)뿐이다. 신청서로 바로 가는 주소는 없다.
 * 그래서 "신청 페이지로 이동"이라고 하지 않는다. LH 상세는 청약플러스(apply.lh.or.kr) 안에 있고
 * 그 페이지에서 신청이 이어지므로 "LH청약플러스에서 신청하기"라고 부를 수 있다.
 * SH 상세는 게시판 글이라 거기서 곧장 신청하지 않는다 — "공고 페이지"라고만 부른다.
 *
 * 마감된 공고에는 띄우지 않는다. 넣을 수 없는 곳으로 가는 버튼은 넣을 수 있다고 읽힌다.
 * 원문이 필요하면 SourceCard가 그대로 있다.
 */
export interface ApplyLink {
  label: string;
  url: string;
}

const LH_APPLY = /^https?:\/\/apply\.lh\.or\.kr\//;

export function applyLink(a: Pick<Announcement, "provider" | "detail_url" | "apply_start" | "apply_end">, now = new Date()): ApplyLink | null {
  const url = a.detail_url;
  if (!url || !hasSource(url)) return null;
  const phase = applyPhase(a, now);
  if (phase.kind === "closed") return null;
  const who = a.provider && a.provider !== "기타" ? a.provider : "기관";
  if (phase.kind === "open" && LH_APPLY.test(url)) return { label: "LH청약플러스에서 신청하기", url };
  return { label: `${who} 공고 페이지 열기`, url };
}
