import { describe, expect, it } from "vitest";
import { EXPO_BATCH, isExpoToken, newAnnouncementMessage, sendExpoPush } from "../src/push/expo";

const tok = (n: number) => `ExponentPushToken[t${n}]`;

describe("newAnnouncementMessage", () => {
  it("제목은 지역, 본문은 공고 제목, 안드로이드 채널은 new", () => {
    const m = newAnnouncementMessage(tok(1), { id: "a1", title: "강서염창 통합공공임대주택 입주자 모집공고", regionName: "서울 강서구" });
    expect(m).toEqual({
      to: tok(1),
      title: "서울 강서구 새 공고",
      body: "강서염창 통합공공임대주택 입주자 모집공고",
      data: { announcementId: "a1", kind: "new" },
      channelId: "new",
      sound: "default",
    });
  });

  it("Expo 토큰 모양", () => {
    expect(isExpoToken("ExponentPushToken[abc]")).toBe(true);
    expect(isExpoToken("ExpoPushToken[abc]")).toBe(true);
    expect(isExpoToken("garbage")).toBe(false);
  });
});

describe("sendExpoPush", () => {
  const msgs = (n: number) => Array.from({ length: n }, (_, i) => newAnnouncementMessage(tok(i), { id: "a", title: "t", regionName: "r" }));

  it("100건씩 나눠 보내고 ticket을 센다", async () => {
    const bodies: unknown[][] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as unknown[];
      bodies.push(batch);
      return new Response(JSON.stringify({ data: batch.map(() => ({ status: "ok", id: "x" })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendExpoPush(msgs(230), { fetchImpl });
    expect(bodies.map((b) => b.length)).toEqual([EXPO_BATCH, EXPO_BATCH, 30]);
    expect(r).toEqual({ sent: 230, failed: 0, dead: [], errors: [] });
  });

  it("DeviceNotRegistered 토큰은 dead로 돌려준다 — 부르는 쪽이 지운다", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as { to: string }[];
      return new Response(
        JSON.stringify({ data: batch.map((m, i) => (i === 1 ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok" })) }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await sendExpoPush(msgs(3), { fetchImpl });
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.dead).toEqual([tok(1)]);
  });

  it("토큰 모양이 아닌 것은 보내지 않고 dead로 — 한 줄이 잘못돼도 요청 전체가 거절된다", async () => {
    let called = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      called++;
      const batch = JSON.parse(String(init?.body)) as unknown[];
      return new Response(JSON.stringify({ data: batch.map(() => ({ status: "ok" })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendExpoPush([...msgs(2), newAnnouncementMessage("bad-token", { id: "a", title: "t", regionName: "r" })], { fetchImpl });
    expect(called).toBe(1);
    expect(r.sent).toBe(2);
    expect(r.dead).toEqual(["bad-token"]);
  });

  it("요청 자체가 실패하면 그 묶음을 실패로 세고 다음 묶음은 계속", async () => {
    let n = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as unknown[];
      return ++n === 1 ? new Response("", { status: 500 }) : new Response(JSON.stringify({ data: batch.map(() => ({ status: "ok" })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendExpoPush(msgs(120), { fetchImpl });
    expect(r.failed).toBe(100);
    expect(r.sent).toBe(20);
    expect(r.errors).toEqual(["HTTP 500"]);
  });
});
