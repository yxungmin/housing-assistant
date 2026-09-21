import { describe, expect, it } from "vitest";
import { canSend, draftReport, findReport, targetKey, toPayload, type LocalReport, type ReportTarget } from "../src/lib/reports";

const target: ReportTarget = { kind: "pricing", trackIndex: 0, itemIndex: 3, label: "59㎡ · 보증금 5억 1,402만 원", page: 15 };
const make = (over: Partial<Parameters<typeof draftReport>[0]> = {}) =>
  draftReport({ announcementId: "018", announcementTitle: "제51차 장기전세", target, message: " 보증금이 달라요 ", ...over });

describe("reports", () => {
  it("같은 항목이면 같은 키 — 화면에 보이던 문장이 달라져도", () => {
    expect(targetKey(target)).toBe(targetKey({ ...target, label: "다른 문장", page: 99 }));
  });

  it("트랙이나 항목이 다르면 다른 키", () => {
    expect(targetKey({ ...target, itemIndex: 4 })).not.toBe(targetKey(target));
    expect(targetKey({ ...target, trackIndex: 1 })).not.toBe(targetKey(target));
    expect(targetKey({ ...target, kind: "rule" })).not.toBe(targetKey(target));
  });

  it("공백을 떼고 담는다. 처음에는 못 보낸 상태로 확인 중", () => {
    const r = make();
    expect(r.message).toBe("보증금이 달라요");
    expect(r.sent).toBe(false);
    expect(r.status).toBe("OPEN");
  });

  it("빈 제안 값은 넣지 않는다", () => {
    expect(make({ suggested: "   " }).suggested).toBeUndefined();
    expect(make({ suggested: " 4억 3,524만 원 " }).suggested).toBe("4억 3,524만 원");
  });

  it("같은 항목을 이미 신고했는지 공고별로 찾는다", () => {
    const reports: LocalReport[] = [make()];
    expect(findReport(reports, "018", target)).toBeDefined();
    expect(findReport(reports, "018", { ...target, itemIndex: 4 })).toBeUndefined();
    expect(findReport(reports, "005", target)).toBeUndefined();
  });

  it("번들 데이터의 id는 서버에 넣을 수 없다 (announcements.id는 uuid)", () => {
    expect(canSend(make())).toBe(false);
    expect(canSend(make({ announcementId: "3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b" }))).toBe(true);
  });

  it("전송 payload는 서버 컬럼 이름으로 나가고 빈 값은 null", () => {
    const p = toPayload(make({ announcementId: "3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b" }));
    expect(p).toMatchObject({ announcement_id: "3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", target_kind: "pricing", track_index: 0, item_index: 3, page: 15, suggested: null });
    expect(p.client_id.length).toBeGreaterThan(8);
  });

  it("신고 id는 매번 다르다", () => {
    expect(make().id).not.toBe(make().id);
  });
});
