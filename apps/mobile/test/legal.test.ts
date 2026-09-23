import { describe, expect, it } from "vitest";
import { isDraft, LEGAL_DOCS, PRIVACY, TERMS } from "../src/legal";
import { PRICE_KRW, TRIAL_DAYS } from "../src/lib/billing";
import { BUSINESS, businessBlanks, ftcLookupUrl, type BusinessInfo } from "../src/legal/business";

/**
 * 법률 문서는 코드와 어긋나면 안 된다. 어긋남이 오타가 아니라 위법 사실의 증거가 되는
 * 종류의 문서다 — "이렇게 한다고 적어 두고 실제로는 다르게 했다"가 되기 때문이다.
 * 숫자와 약속을 여기서 고정한다.
 */
describe("약관이 코드와 같은 말을 하는가", () => {
  const terms = TERMS.sections.flatMap((s) => s.body).join("\n");

  it("가격과 무료 기간이 billing.ts와 같다", () => {
    expect(terms).toContain(`${PRICE_KRW.toLocaleString("ko-KR")}원`);
    expect(terms).toContain(`${TRIAL_DAYS}일`);
  });

  it("해지가 앱 안에서 된다고 말하지 않는다 — 스토어에서만 된다", () => {
    const cancel = TERMS.sections.find((s) => s.heading.includes("해지"))!;
    expect(cancel.body.join()).toMatch(/App Store|Google Play|스토어/);
    expect(cancel.body.join()).toContain("앱 안에서 할 수 없");
  });

  it("구독이 끝나도 알림은 끊지 않겠다는 약속이 적혀 있다", () => {
    expect(terms).toContain("마감을 놓치게 하지 않습니다");
  });
});

/**
 * 환불이 이 문서에서 제일 위험한 자리다. "환불은 스토어 정책에 따릅니다" 한 줄로
 * 끝내면 법정 청약철회권을 배제하는 것으로 읽히고, 전자상거래법 제35조에 따라
 * 소비자에게 불리한 약정은 효력이 없다.
 */
describe("환불 조항", () => {
  const refund = TERMS.sections.find((s) => s.heading.includes("청약철회"))!;
  const text = refund.body.join("\n");

  it("7일 청약철회권을 먼저 적는다", () => {
    expect(text).toContain("7일");
    expect(text).toContain("청약을 철회");
  });

  it("제한 사유를 적되 '제공'이 무엇인지 정의한다 — 구독만으로는 제공이 아니다", () => {
    expect(text).toContain("주거비 계산을 1회 이상 실행");
    expect(text).toContain("구독을 시작한 사실만으로는 제공된 것으로 보지 않습니다");
  });

  it("아직 제공되지 않은 부분은 철회할 수 있다고 적는다", () => {
    expect(text).toContain("아직 제공되지 않은 부분");
  });

  it("환불 책임을 스토어에 떠넘기지 않는다", () => {
    expect(text).toContain("직접 환불을 요청할 수 있습니다");
    expect(text).toContain("떠넘기지 않습니다");
  });

  it("법령이 우선한다는 구제 조항이 있다 — 불리한 조항은 무효다", () => {
    expect(text).toContain("법령이 우선합니다");
  });

  it("무료 기간에는 환불 대상이 없다고 분명히 한다", () => {
    expect(text).toContain("결제가 발생하지 않으므로");
  });
});

describe("개인정보처리방침이 구현과 같은 말을 하는가", () => {
  const body = PRIVACY.sections.flatMap((s) => s.body).join("\n");

  it("기기에만 두는 항목을 이름으로 적는다", () => {
    for (const k of ["소득", "자산", "부채", "혼인", "청약통장", "저장한 공고"]) {
      expect(body).toContain(k);
    }
  });

  it("좌표를 100m로 뭉갠다고 적는다 (data/transit.ts의 originFor와 같다)", () => {
    expect(body).toContain("셋째 자리");
    expect(body).toContain("100m");
  });

  it("앱 안에서 계정을 지울 수 있다고 적는다 (App Store 5.1.1(v))", () => {
    expect(body).toContain("계정 삭제");
  });
});

describe("초안 표시", () => {
  it("빈칸이 남아 있으면 초안이다 — 확정본처럼 보여 주면 안 된다", () => {
    for (const doc of Object.values(LEGAL_DOCS)) {
      expect(isDraft(doc)).toBe(true);
      expect(doc.blanks.length).toBeGreaterThan(0);
    }
  });

  it("시행일을 채워도 빈칸이 남아 있으면 여전히 초안이다", () => {
    expect(isDraft({ ...TERMS, effectiveAt: "2026-10-01" })).toBe(true);
    expect(isDraft({ ...TERMS, effectiveAt: "2026-10-01", blanks: [] })).toBe(false);
  });
});

describe("사업자 정보", () => {
  const full: BusinessInfo = { name: "상호", representative: "대표", registrationNo: "123-45-67890", mailOrderNo: "제2026-서울강남-0000호", address: "서울", contact: "help@example.com" };

  it("빈칸을 이름으로 알려 준다 — 출시 전에 0개여야 한다", () => {
    expect(businessBlanks(full)).toEqual([]);
    expect(businessBlanks({ ...full, mailOrderNo: " " })).toEqual(["통신판매업 신고번호"]);
  });

  it("사업자 정보가 비어 있으면 약관도 초안이다 — 한쪽만 채우고 내보내지 않는다", () => {
    if (businessBlanks(BUSINESS).length > 0) expect(isDraft(TERMS)).toBe(true);
  });

  it("공정위 조회는 10자리 번호일 때만 연다", () => {
    expect(ftcLookupUrl("123-45-67890")).toBe("https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890");
    expect(ftcLookupUrl("")).toBeNull();
    expect(ftcLookupUrl("123-45")).toBeNull();
  });
});
