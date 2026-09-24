/**
 * 수집기 공통 fetch — 시간 제한 · 일시 오류 재시도 · 호출 사이 쉼.
 *
 * 열두 개 클라이언트(LH·SH·카카오·시세·대기현황·K-apt·교통…) 어느 것도 시간 제한이 없었고,
 * 재시도·쉼은 K-apt에만 있었다 (2026-09-24 감사). 각 클라이언트는 `fetchImpl: typeof fetch = resilientFetch()`처럼
 * 기본값으로 이걸 받는다 — 테스트가 넘기는 가짜 fetch는 그대로 통한다.
 *
 * 여기서 보는 것은 **전송 층**뿐이다: 끊긴 연결, 5xx, 429. 포털이 HTTP 200에 담아 보내는 오류(코드 04·22)는
 * 각 클라이언트가 portal.ts로 읽는다 — 그건 본문을 알아야 판단할 수 있다.
 */
export interface ResilientOptions {
  /** 응답이 시작되지 않으면 이만큼 기다리고 끊는다 */
  timeoutMs?: number;
  /** 5xx·429·네트워크 오류에 다시 시도하는 횟수 */
  retries?: number;
  /** 재시도 사이 간격 (ms). 횟수보다 짧으면 마지막 값을 반복한다 */
  retryDelaysMs?: number[];
  /** 호출 사이 최소 간격 (ms). 같은 래퍼 인스턴스를 쓰는 호출끼리만 */
  paceMs?: number;
  /** 테스트용 시계 */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`${ms}ms 안에 응답이 없음 — ${url.split("?")[0]}`);
  }
}

/** 다시 시도할 만한 응답인가 (서버 쪽 일시 오류·과다 호출) */
export const isTransientStatus = (status: number): boolean => status === 429 || (status >= 500 && status < 600);

export function resilientFetch(base: typeof fetch = fetch, opts: ResilientOptions = {}): typeof fetch {
  const { timeoutMs = 15_000, retries = 2, retryDelaysMs = [1_000, 3_000], paceMs = 0, sleep = defaultSleep } = opts;
  let lastCall = 0;
  const wrapped = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (let attempt = 0; ; attempt++) {
      if (paceMs > 0) {
        const wait = lastCall + paceMs - Date.now();
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();
      }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      // 부르는 쪽이 준 signal도 존중한다 — 둘 중 하나가 끊으면 끊는다
      init?.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
      let res: Response | undefined;
      let err: unknown;
      try {
        res = await base(input, { ...init, signal: ctl.signal });
      } catch (e) {
        err = ctl.signal.aborted && !init?.signal?.aborted ? new HttpTimeoutError(url, timeoutMs) : e;
      } finally {
        clearTimeout(timer);
      }
      const retry = attempt < retries && (res ? isTransientStatus(res.status) : !init?.signal?.aborted);
      if (!retry) {
        if (res) return res;
        throw err;
      }
      await sleep(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? 1_000);
    }
  };
  return wrapped as typeof fetch;
}
