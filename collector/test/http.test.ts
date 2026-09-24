import { describe, expect, it } from "vitest";
import { HttpTimeoutError, resilientFetch } from "../src/http";

const noSleep = async () => {};

describe("resilientFetch", () => {
  it("5xx·429는 정해진 횟수만큼 다시 부른다", async () => {
    const codes = [503, 429, 200];
    let n = 0;
    const base = (async () => new Response("ok", { status: codes[n++]! })) as unknown as typeof fetch;
    const res = await resilientFetch(base, { retries: 2, sleep: noSleep })("https://x/a");
    expect(res.status).toBe(200);
    expect(n).toBe(3);
  });

  it("횟수를 넘기면 마지막 응답을 그대로 준다 — 던지지 않는다 (부르는 쪽이 status를 본다)", async () => {
    let n = 0;
    const base = (async () => {
      n++;
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;
    const res = await resilientFetch(base, { retries: 1, sleep: noSleep })("https://x/a");
    expect(res.status).toBe(500);
    expect(n).toBe(2);
  });

  it("4xx는 다시 부르지 않는다", async () => {
    let n = 0;
    const base = (async () => {
      n++;
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
    expect((await resilientFetch(base, { retries: 3, sleep: noSleep })("https://x/a")).status).toBe(404);
    expect(n).toBe(1);
  });

  it("응답이 없으면 시간 제한으로 끊고, 그것도 재시도 뒤에 던진다", async () => {
    let n = 0;
    const base = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        n++;
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    await expect(resilientFetch(base, { timeoutMs: 10, retries: 1, sleep: noSleep })("https://x/slow?k=1")).rejects.toBeInstanceOf(HttpTimeoutError);
    expect(n).toBe(2);
  });

  it("네트워크 오류도 다시 부른다", async () => {
    let n = 0;
    const base = (async () => {
      if (n++ === 0) throw new Error("ECONNRESET");
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    expect((await resilientFetch(base, { retries: 1, sleep: noSleep })("https://x/a")).status).toBe(200);
  });

  it("호출 사이 쉼을 둔다", async () => {
    const waits: number[] = [];
    const base = (async () => new Response("ok")) as unknown as typeof fetch;
    const f = resilientFetch(base, { paceMs: 250, sleep: async (ms) => void waits.push(ms) });
    await f("https://x/1");
    await f("https://x/2");
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(0);
    expect(waits[0]).toBeLessThanOrEqual(250);
  });
});
