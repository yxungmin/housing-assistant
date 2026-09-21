import { describe, expect, it } from "vitest";
import { emptySeen, isUnseen, markOpened, noteSeen, unseenCount } from "../src/lib/unseen";

describe("unseen", () => {
  it("처음 켰을 때는 아무것도 새 것이 아니다 — 전부 새 것이면 아무것도 새 것이 아니다", () => {
    const { next, fresh } = noteSeen(emptySeen, ["a", "b", "c"]);
    expect(fresh).toEqual([]);
    expect(next.newIds).toEqual([]);
    expect(next.known).toHaveLength(3);
  });

  it("기준선 뒤에 나타난 공고만 새 것이다", () => {
    const { next: base } = noteSeen(emptySeen, ["a", "b"]);
    const { next, fresh } = noteSeen(base, ["a", "b", "c"]);
    expect(fresh).toEqual(["c"]);
    expect(isUnseen(next, "c")).toBe(true);
    expect(isUnseen(next, "a")).toBe(false);
  });

  it("상세를 열면 표시가 사라진다", () => {
    const { next: base } = noteSeen(emptySeen, ["a"]);
    const { next } = noteSeen(base, ["a", "b"]);
    expect(isUnseen(markOpened(next, "b"), "b")).toBe(false);
  });

  it("같은 목록을 다시 봐도 상태가 바뀌지 않는다 (저장·렌더를 아끼려고 같은 객체를 돌려준다)", () => {
    const { next: base } = noteSeen(emptySeen, ["a", "b"]);
    const again = noteSeen(base, ["b", "a"]);
    expect(again.next).toBe(base);
    expect(again.fresh).toEqual([]);
  });

  it("공고가 목록에서 빠졌다가 다시 들어와도 새 것이 아니다", () => {
    const { next: base } = noteSeen(emptySeen, ["a", "b"]);
    const { next: gone } = noteSeen(base, ["a"]);
    const { fresh } = noteSeen(gone, ["a", "b"]);
    expect(fresh).toEqual([]);
  });

  it("한 번 연 공고는 새 공고가 다시 와도 계속 읽은 상태다", () => {
    const { next: base } = noteSeen(emptySeen, ["a"]);
    const { next: withB } = noteSeen(base, ["a", "b"]);
    const opened = markOpened(withB, "b");
    const { next } = noteSeen(opened, ["a", "b", "c"]);
    expect(isUnseen(next, "b")).toBe(false);
    expect(isUnseen(next, "c")).toBe(true);
  });

  it("안 본 개수를 센다", () => {
    const { next: base } = noteSeen(emptySeen, ["a"]);
    const { next } = noteSeen(base, ["a", "b", "c"]);
    expect(unseenCount(next, ["a", "b", "c"])).toBe(2);
    expect(unseenCount(next, ["a"])).toBe(0);
  });

  it("markOpened는 모르는 id에 아무 일도 하지 않는다", () => {
    const { next: base } = noteSeen(emptySeen, ["a"]);
    expect(markOpened(base, "zzz")).toBe(base);
  });
});
