/**
 * 사업자 정보. 내 정보 맨 아래에 그대로 보인다.
 *
 * 돈을 받는 서비스는 상호·대표자·사업자등록번호·통신판매업 신고번호·주소·연락처를
 * 이용자가 쉽게 알 수 있게 표시해야 한다 (전자상거래법 제10조, 제13조 제1항).
 * 앱 구독을 팔면 앱이 그 "사이버몰"이라, 약관 안에만 두지 않고 화면에 둔다.
 *
 * 사업자등록을 신청해 둔 상태다(2026-09-24). 등록증과 통신판매업 신고증이 나오면 여기만 채운다 —
 * 약관(terms.ts)의 blanks도 같이 지운다. 빈칸이 남아 있으면 화면이 "준비 중"이라고 적는다.
 * 빈 줄을 숨기지 않는 이유: 숨기면 비어 있다는 사실까지 숨겨져 출시 전에 아무도 못 알아챈다.
 */
export interface BusinessInfo {
  name: string;
  representative: string;
  /** 000-00-00000 */
  registrationNo: string;
  /** 제0000-서울00-0000호 */
  mailOrderNo: string;
  address: string;
  /** 문의 이메일 또는 전화 */
  contact: string;
}

export const BUSINESS: BusinessInfo = {
  name: "",
  representative: "",
  registrationNo: "",
  mailOrderNo: "",
  address: "",
  contact: "",
};

export const BUSINESS_FIELDS: ReadonlyArray<readonly [keyof BusinessInfo, string]> = [
  ["name", "상호"],
  ["representative", "대표자"],
  ["registrationNo", "사업자등록번호"],
  ["mailOrderNo", "통신판매업 신고번호"],
  ["address", "주소"],
  ["contact", "문의"],
];

/** 아직 비어 있는 항목의 이름. 출시 전에 0개가 되어야 한다 */
export const businessBlanks = (b: BusinessInfo = BUSINESS): string[] =>
  BUSINESS_FIELDS.filter(([k]) => !b[k].trim()).map(([, label]) => label);

/**
 * 공정거래위원회 사업자정보 공개 페이지. 통신판매사업자라면 여기서 신고 내용을 누구나 확인할 수 있다.
 * 번호가 10자리가 아니면 없다 — 틀린 번호로 남의 사업자 정보를 띄우지 않는다.
 */
export function ftcLookupUrl(registrationNo: string): string | null {
  const digits = registrationNo.replace(/\D/g, "");
  return digits.length === 10 ? `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${digits}` : null;
}
