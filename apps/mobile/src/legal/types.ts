/**
 * 약관·개인정보처리방침 본문.
 *
 * **여기가 원본이다.** App Store는 개인정보처리방침 URL을 요구하므로 웹에도 같은 글이
 * 있어야 하는데, 두 벌을 손으로 맞추면 반드시 어긋난다. 그리고 이 문서들에서 어긋남은
 * 오타가 아니라 위법 사실의 증거가 된다 — 방침에 적은 것과 실제 처리가 다른 것이니까.
 *
 * 그래서 이 파일이 원본이고, `npm run legal:md`가 docs/*.md를 만든다. md는 고치지 않는다.
 */
export interface LegalSection {
  heading: string;
  /** 문단. 줄 앞에 "- "를 붙이면 목록으로 그린다 */
  body: string[];
}

export interface LegalDoc {
  key: "terms" | "privacy";
  title: string;
  /** 시행일 (YYYY-MM-DD). 비어 있으면 화면이 "초안"이라고 알린다 */
  effectiveAt: string;
  /** 게시 전에 채워야 하는 것. 비어 있지 않으면 화면 맨 위에 경고가 뜬다 */
  blanks: string[];
  intro?: string[];
  sections: LegalSection[];
}
