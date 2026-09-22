import { describe, expect, it } from "vitest";
import { plannedReminders, type ReminderItem } from "../src/lib/reminders";

const NOW = new Date(2026, 8, 22, 12, 0, 0); // 2026-09-22 12:00
const item = (over: Partial<ReminderItem> = {}): ReminderItem => ({ id: "a1", title: "망원 행복주택", ...over });

const kinds = (items: ReminderItem[]) => plannedReminders(items, NOW).map((r) => r.id);

describe("접수 마감 알림", () => {
  it("관심 공고는 마감 3일 전에 알린다", () => {
    const [r] = plannedReminders([item({ saved: true, apply_end: "2026-10-05" })], NOW);
    expect(r!.kind).toBe("deadline");
    expect(r!.at).toEqual(new Date(2026, 9, 2, 9, 0, 0));
    expect(r!.body).toContain("10월 5일");
  });

  it("관심 공고가 아니면 걸지 않는다", () => {
    expect(kinds([item({ apply_end: "2026-10-05" })])).toEqual([]);
  });

  it("이미 지난 시각은 걸지 않는다", () => {
    expect(kinds([item({ saved: true, apply_end: "2026-09-23" })])).toEqual([]);
  });
});

describe("당첨자 발표 알림", () => {
  it("신청한 공고는 3일 전·1일 전·당일 세 번 알린다", () => {
    const out = plannedReminders([item({ applied: true, winner_announce: "2026-11-10" })], NOW);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.at.getDate())).toEqual([7, 9, 10]);
    expect(out[2]!.title).toBe("오늘 당첨자 발표예요");
  });

  it("신청함 표시를 안 했으면 걸지 않는다 — 관심만으로는 발표가 내 일이 아니다", () => {
    expect(kinds([item({ saved: true, winner_announce: "2026-11-10" })])).toEqual([]);
  });

  it("월까지만 있는 발표일로 날짜를 지어내지 않는다", () => {
    expect(kinds([item({ applied: true, winner_announce: "2027-02" })])).toEqual([]);
    expect(kinds([item({ applied: true, winner_announce: "공고문 참조" })])).toEqual([]);
  });

  it("발표가 내일이면 지난 3일 전은 빼고 남은 것만 건다", () => {
    const out = plannedReminders([item({ applied: true, winner_announce: "2026-09-23" })], NOW);
    expect(out.map((r) => r.id)).toEqual(["announce:a1:0"]);
  });

  it("발표가 오늘이어도 오전 9시가 지났으면 걸지 않는다", () => {
    expect(kinds([item({ applied: true, winner_announce: "2026-09-22" })])).toEqual([]);
  });
});

describe("함께 걸 때", () => {
  it("관심이면서 신청한 공고는 마감과 발표를 모두 건다", () => {
    const out = plannedReminders([item({ saved: true, applied: true, apply_end: "2026-10-05", winner_announce: "2026-11-10" })], NOW);
    expect(out.filter((r) => r.kind === "deadline")).toHaveLength(1);
    expect(out.filter((r) => r.kind === "announce")).toHaveLength(3);
  });

  it("시간 순으로 준다", () => {
    const out = plannedReminders(
      [
        item({ id: "late", applied: true, winner_announce: "2026-12-01" }),
        item({ id: "soon", saved: true, apply_end: "2026-10-05" }),
      ],
      NOW,
    );
    expect(out[0]!.announcementId).toBe("soon");
  });

  it("id가 겹치지 않는다 — 예약을 지우고 다시 걸 때 섞이면 안 된다", () => {
    const out = plannedReminders([item({ saved: true, applied: true, apply_end: "2026-10-05", winner_announce: "2026-11-10" })], NOW);
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
  });
});

/**
 * 첫 결제 고지. 공정위 다크패턴 가이드라인이 "숨은 갱신"을 지목한다 —
 * 무료 체험을 걸어 두고 결제일에 말없이 긁는 방식이다. 안 하겠다는 약속을 여기서 고정한다.
 */
describe("첫 결제 3일 전 고지", () => {
  const now = new Date(2026, 8, 22, 12, 0, 0); // 2026-09-22 12:00
  const plan = (chargeAt: string | null | undefined, priceText?: string) =>
    plannedReminders([], now, { chargeAt, priceText }).filter((r) => r.kind === "charge");

  it("결제 3일 전 09:00에 건다", () => {
    const [r] = plan(new Date(2026, 9, 5, 3, 0, 0).toISOString());
    expect(r?.at).toEqual(new Date(2026, 9, 2, 9, 0, 0));
  });

  it("금액과 날짜를 말한다 — 금액 없는 고지는 고지가 아니다", () => {
    const [r] = plan(new Date(2026, 9, 5).toISOString(), "월 1,900원");
    expect(r?.body).toContain("월 1,900원");
    expect(r?.body).toContain("10월 5일");
    expect(r?.body).toContain("해지");
  });

  it("체험 중이 아니면 걸지 않는다 — chargeDate가 null을 준다", () => {
    expect(plan(null)).toEqual([]);
    expect(plan(undefined)).toEqual([]);
  });

  it("이미 3일 안쪽이면 걸지 않는다 — 지난 시각으로 예약할 수 없다", () => {
    expect(plan(new Date(2026, 8, 24).toISOString())).toEqual([]);
  });

  it("망가진 날짜로 알림을 지어내지 않는다", () => {
    expect(plan("나중에")).toEqual([]);
  });

  it("공고 알림과 같은 목록에 실린다 — 따로 걸면 cancelAll에 지워진다", () => {
    const all = plannedReminders(
      [{ id: "a1", title: "행복주택", apply_end: "2026-10-01", saved: true }],
      now,
      { chargeAt: new Date(2026, 9, 5).toISOString() },
    );
    expect(all.map((r) => r.kind).sort()).toEqual(["charge", "deadline"]);
  });

  it("공고와 무관하므로 announcementId가 비어 있다 — 눌러도 엉뚱한 공고로 가지 않는다", () => {
    expect(plan(new Date(2026, 9, 5).toISOString())[0]?.announcementId).toBe("");
  });
});
