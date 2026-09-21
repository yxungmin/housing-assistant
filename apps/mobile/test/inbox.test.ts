import { describe, expect, it } from "vitest";
import {
  addNotifications,
  fromChange,
  markAllRead,
  markRead,
  pruneNotifications,
  removeNotification,
  RETAIN_DAYS,
  syncInbox,
  unreadCount,
  type AppNotification,
} from "../src/lib/inbox";

const NOW = new Date("2026-09-22T09:00:00+09:00");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const note = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "new:001",
  kind: "new",
  title: "새 공고가 올라왔어요",
  body: "관악봉천 행복주택",
  announcementId: "001",
  at: NOW.toISOString(),
  read: false,
  ...over,
});

describe("pruneNotifications", () => {
  it(`${RETAIN_DAYS}일이 지나면 버린다`, () => {
    const list = [note({ id: "a", at: ago(RETAIN_DAYS - 1) }), note({ id: "b", at: ago(RETAIN_DAYS + 1) })];
    expect(pruneNotifications(list, NOW).map((n) => n.id)).toEqual(["a"]);
  });

  it("시각을 읽을 수 없으면 버리지 않는다 — 우리 실수로 기록을 지우지 않는다", () => {
    expect(pruneNotifications([note({ id: "a", at: "이상한값" })], NOW)).toHaveLength(1);
  });
});

describe("addNotifications", () => {
  it("이미 있는 id는 건드리지 않는다 — 읽음 표시를 되돌리지 않는다", () => {
    const list = [note({ id: "x", read: true })];
    const after = addNotifications(list, [note({ id: "x", read: false })]);
    expect(after).toHaveLength(1);
    expect(after[0]!.read).toBe(true);
  });

  it("새 것이 없으면 같은 배열을 그대로 준다 (화면이 헛되이 다시 그리지 않게)", () => {
    const list = [note({ id: "x" })];
    expect(addNotifications(list, [note({ id: "x" })])).toBe(list);
  });

  it("새 것이 위로 온다", () => {
    const list = [note({ id: "old", at: ago(3) })];
    const after = addNotifications(list, [note({ id: "fresh", at: ago(0) })]);
    expect(after.map((n) => n.id)).toEqual(["fresh", "old"]);
  });
});

describe("읽음·삭제", () => {
  it("하나만 읽음", () => {
    const list = [note({ id: "a" }), note({ id: "b" })];
    expect(markRead(list, "a").map((n) => n.read)).toEqual([true, false]);
  });

  it("전부 읽음", () => {
    expect(unreadCount(markAllRead([note({ id: "a" }), note({ id: "b" })]))).toBe(0);
  });

  it("이미 다 읽었으면 같은 배열 그대로", () => {
    const list = [note({ id: "a", read: true })];
    expect(markAllRead(list)).toBe(list);
  });

  it("삭제", () => {
    expect(removeNotification([note({ id: "a" }), note({ id: "b" })], "a").map((n) => n.id)).toEqual(["b"]);
  });

  it("안 읽은 개수", () => {
    expect(unreadCount([note({ id: "a" }), note({ id: "b", read: true })])).toBe(1);
  });
});

describe("fromChange", () => {
  it("무엇이 바뀌었는지 요약에 담는다 — 열지 않고도 알 수 있어야 한다", () => {
    const n = fromChange({
      announcementId: "008",
      title: "강서염창 통합공공임대주택",
      at: "2026-09-20T01:00:00.000Z",
      changes: [{ kind: "price", text: "보증금 5억 1,402만 원 → 4억 3,524만 원" }, { kind: "deadline", text: "마감 10월 1일 → 10월 8일" }],
      seen: false,
    });
    expect(n.kind).toBe("change");
    expect(n.body).toContain("보증금");
    expect(n.body).toContain("마감");
    expect(n.announcementId).toBe("008");
    // 같은 발견 시각이면 같은 알림이다
    expect(n.id).toBe("change:008:2026-09-20T01:00:00.000Z");
  });
});

describe("syncInbox", () => {
  const list = [
    { id: "001", title: "관악봉천 행복주택", apply_end: "2026-09-24" },
    { id: "002", title: "강서염창 통합공공임대", apply_end: "2026-10-30" },
    { id: "003", title: "마감 지난 공고", apply_end: "2026-09-10" },
    { id: "004", title: "마감일 없는 공고" },
  ];

  it("관심 공고가 마감 3일 안쪽이면 알린다", () => {
    const out = syncInbox(list, ["001"], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("deadline");
    expect(out[0]!.body).toContain("2일 뒤");
  });

  it("아직 먼 것은 알리지 않는다", () => {
    expect(syncInbox(list, ["002"], [], NOW)).toHaveLength(0);
  });

  it("이미 끝난 것은 알리지 않는다 — 지금 할 수 있는 일이 없는 알림은 성가심이다", () => {
    expect(syncInbox(list, ["003"], [], NOW)).toHaveLength(0);
  });

  it("마감일이 없으면 알리지 않는다", () => {
    expect(syncInbox(list, ["004"], [], NOW)).toHaveLength(0);
  });

  it("관심 공고가 아니면 마감 알림을 만들지 않는다 — 전체에 만들면 매일 수십 개가 쌓인다", () => {
    expect(syncInbox(list, [], [], NOW)).toHaveLength(0);
  });

  it("마감일이 id에 들어간다 — 정정으로 마감이 밀리면 다시 알린다", () => {
    expect(syncInbox(list, ["001"], [], NOW)[0]!.id).toBe("deadline:001:2026-09-24");
  });

  it("오늘 마감이면 그렇게 말한다", () => {
    const today = syncInbox([{ id: "x", title: "오늘 마감", apply_end: "2026-09-22" }], ["x"], [], NOW);
    expect(today[0]!.body).toContain("오늘 끝나요");
  });

  it("새 공고는 제목을 요약으로 쓴다", () => {
    const out = syncInbox(list, [], ["002"], NOW);
    expect(out[0]!.kind).toBe("new");
    expect(out[0]!.id).toBe("new:002");
    expect(out[0]!.body).toBe("강서염창 통합공공임대");
  });

  it("목록에 없는 id는 건너뛴다", () => {
    expect(syncInbox(list, ["없음"], ["없음"], NOW)).toHaveLength(0);
  });
});
