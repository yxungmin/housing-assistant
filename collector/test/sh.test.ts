import { describe, expect, it } from "vitest";
import { parseNoticeDetail, parseNoticeList, parseTotalCount, pickNoticePdf, ShClient, type ShAttachment } from "../src/sh/api";

/** 2026-09-21 실제 응답에서 잘라낸 목록 조각 */
const LIST_HTML = `
<div class="topTxt"><div class="mentcount">총 <strong class="cBrown bold">23</strong> 건 [1/3페이지]</div></div>
<div id="listTb" class="listTable colRm"><table><caption>주택임대</caption>
<tbody>
<tr>
  <td>23</td>
  <td class="txtL"><a href="#" class="ellipsis " onclick="javascript:getDetailView('310258');return false;">
    2026년 2차 희망하우징(공공기숙사) 입주자 모집공고(2026. 9. 17.)
  </a></td>
  <td> 맞춤주택공급부 </td>
  <td class="num"> 2026-09-17 </td>
  <td class="num">6399</td>
</tr>
<tr>
  <td>22</td>
  <td class="txtL"><a href="#" class="ellipsis " onclick="javascript:getDetailView('310041');return false;">
    2026년 재개발임대주택 일반모집 공고(2026. 9. 9.)
  </a></td>
  <td> 주택공급기준부 </td>
  <td class="num"> 2026-09-09 </td>
  <td class="num">93231</td>
</tr>
<tr>
  <td>20</td>
  <td class="txtL"><a href="#" class="ellipsis " onclick="javascript:getDetailView('309467');return false;">
    (수정) 2026년 2차 장기미임대 매입임대주택 입주자모집공고(2026. 8. 28.)
  </a></td>
  <td> 매입주택공급부 </td>
  <td class="num"> 2026-08-28 </td>
  <td class="num">21544</td>
</tr>
</tbody></table></div>`;

/** 상세 페이지의 이노릭스 첨부 목록 (실제 형태) */
const DETAIL_HTML = `
<script type="text/javascript">
initParam = {"allowExt":["PDF","pdf"],"fileSize":"5242880"};
initParam.downList = [{"brdId":"GS0401","seq":"310258","fileSeq":"1","fileSize":"576473","oriFileNm":"2026년 2차 희망하우징(공공기숙사) 입주자 모집공고(2026_ 9_ 17_).pdf","fileTp":"A"},{"brdId":"GS0401","seq":"310258","fileSeq":"2","fileSize":"41993","oriFileNm":"희망하우징(공공기숙사) 신청 관련 부모 범위 기준.pdf","fileTp":"A"}];
initInnorix();
</script>`;

describe("SH 목록 파서", () => {
  it("행에서 seq·제목·등록일·부서를 읽는다", () => {
    const rows = parseNoticeList(LIST_HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      sh_id: "310258",
      title: "2026년 2차 희망하우징(공공기숙사) 입주자 모집공고(2026. 9. 17.)",
      notice_date: "2026-09-17",
      department: "맞춤주택공급부",
      region_code: "11",
    });
    expect(rows[0]!.detail_url).toContain("seq=310258");
  });

  it("제목으로 주택유형을 판정하고 미지 유형은 other로 남긴다", () => {
    const rows = parseNoticeList(LIST_HTML);
    expect(rows[1]!.housing_type).toBe("long_term_rental"); // 재개발임대주택
    expect(rows[2]!.housing_type).toBe("purchased_rental"); // 매입임대주택
    expect(rows[0]!.housing_type).toBe("other"); // 희망하우징
    expect(rows[0]!.unknown_codes[0]).toContain("sh_housing_type:");
  });

  it("제목의 (수정) 표기를 정정공고로 본다", () => {
    const rows = parseNoticeList(LIST_HTML);
    expect(rows[2]!.corrected).toBe(true);
    expect(rows[1]!.corrected).toBe(false);
  });

  it("공급유형명을 주면 제목보다 먼저 쓴다", () => {
    const rows = parseNoticeList(LIST_HTML, "행복주택");
    expect(rows[0]!.housing_type).toBe("happy");
  });

  it("총 건수를 읽는다", () => {
    expect(parseTotalCount(LIST_HTML)).toBe(23);
    expect(parseTotalCount("<div>목록 없음</div>")).toBe(0);
  });

  it("목록이 비어도 예외 없이 빈 배열", () => {
    expect(parseNoticeList("<html><body>점검 중입니다</body></html>")).toEqual([]);
  });
});

describe("SH 상세 파서", () => {
  it("첨부 목록과 다운로드 URL을 만든다", () => {
    const d = parseNoticeDetail(DETAIL_HTML);
    expect(d.attachments).toHaveLength(2);
    expect(d.attachments[0]).toMatchObject({ file_seq: "1", size: 576_473, file_tp: "A" });
    expect(d.attachments[0]!.url).toBe("https://www.i-sh.co.kr/main/com/file/innoFD.do?brdId=GS0401&seq=310258&fileTp=A&fileSeq=1");
  });

  it("첨부 순번·크기로 수정 탐지 키를 만든다", () => {
    expect(parseNoticeDetail(DETAIL_HTML).content_key).toBe("1:576473,2:41993");
  });

  it("첨부가 없으면 빈 키", () => {
    const d = parseNoticeDetail("<script>initInnorix();</script>");
    expect(d.attachments).toEqual([]);
    expect(d.content_key).toBe("");
  });
});

describe("pickNoticePdf", () => {
  const att = (name: string, size = 1000): ShAttachment => ({ brd_id: "GS0401", seq: "1", file_seq: "1", file_tp: "A", name, size, url: "" });

  it("모집공고문을 첨부 이름으로 고른다", () => {
    const chosen = pickNoticePdf([att("신청서 양식.pdf"), att("2026년 국민임대주택 입주자 모집공고문.pdf"), att("평면도.pdf")]);
    expect(chosen?.name).toContain("모집공고문");
  });

  it("공고문이 없으면 가장 큰 PDF", () => {
    const chosen = pickNoticePdf([att("유의사항.pdf", 100), att("안내문.pdf", 900_000)]);
    expect(chosen?.name).toBe("안내문.pdf");
  });

  it("PDF가 없으면 undefined", () => {
    expect(pickNoticePdf([att("신청서.hwp")])).toBeUndefined();
  });
});

describe("ShClient", () => {
  it("목록 URL에 모집공고 필터와 기간을 담는다", () => {
    const url = new ShClient().listUrl({ from: new Date(2026, 5, 23), to: new Date(2026, 8, 21), page: 2 });
    expect(url).toContain("isRecrnoti=Y");
    expect(url).toContain("notType1=2");
    expect(url).toContain("srchFr=2026-06-23");
    expect(url).toContain("srchTo=2026-09-21");
    expect(url).toContain("page=2");
  });

  it("총 건수만큼 페이지를 넘겨 모은다", async () => {
    const pages: string[] = [LIST_HTML, LIST_HTML.replace(/310258|310041|309467/g, (m) => `9${m.slice(1)}`), LIST_HTML.replace(/310258|310041|309467/g, (m) => `8${m.slice(1)}`)];
    let calls = 0;
    const fake: typeof fetch = async () => {
      const body = pages[calls++] ?? "";
      return new Response(body, { status: 200 });
    };
    const rows = await new ShClient(fake).listAllRentalNotices();
    expect(calls).toBe(3); // 23건 / 10건 = 3페이지
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r) => r.sh_id)).size).toBe(9);
  });

  it("PDF가 아니면 오류를 낸다", async () => {
    const fake: typeof fetch = async () => new Response("<html>세션 만료</html>", { status: 200 });
    const client = new ShClient(fake);
    const att: ShAttachment = { brd_id: "GS0401", seq: "1", file_seq: "1", file_tp: "A", name: "공고문.pdf", size: 1, url: "https://x" };
    await expect(client.downloadPdf(att)).rejects.toThrow(/PDF가 아닌 응답/);
  });
});
