/**
 * 당첨자 발표 + 커트라인을 한 번에 모아 "지난 회차 결과 풀"을 만든다.
 *
 * 공고마다 따로 부르면 같은 목록을 수십 번 받게 되고, 커트라인은 추첨단위마다
 * 파일 하나를 내려받는 일이라 더 아깝다. 그래서 **한 번 모아 두고 공고들이 나눠 쓴다.**
 *
 * LLM을 쓰지 않는다. 목록은 HTML 안의 `list.push({...})`, 커트라인은 xlsx다.
 */
import { LhResultClient, type ResultNotice } from "./results";
import { LhCutlineClient } from "./cutline";
import type { PastResult } from "@housing/engine";

export interface PoolOptions {
  /** 당첨자 발표 목록을 몇 페이지까지 볼 것인가 (한 페이지 100건) */
  pages?: number;
  /** 커트라인을 몇 건까지 받을 것인가. 파일을 하나씩 내려받으므로 상한을 둔다 */
  limit?: number;
  log?: (msg: string) => void;
}

/** 목록 행에 커트라인에 필요한 값이 다 실려 있다 (results.ts가 남겨 둔다) */
type Row = ResultNotice & { unit_no?: string; draw_no?: string };

export async function buildResultPool(opts: PoolOptions = {}): Promise<PastResult[]> {
  const log = opts.log ?? (() => {});
  const notices = (await new LhResultClient().recent(opts.pages ?? 3)) as Row[];
  log(`당첨자 발표 ${notices.length}건`);

  const cut = new LhCutlineClient();
  const out: PastResult[] = [];
  let tried = 0;
  for (const n of notices) {
    if (tried >= (opts.limit ?? 40)) break;
    if (!n.unit_no || !n.draw_no) continue;
    tried++;
    const c = await cut.fetch(n.unit_no, n.draw_no).catch(() => null);
    // 모든 공고에 커트라인이 붙지는 않는다 (선착순·잔여세대 등). 없으면 조용히 넘어간다.
    if (!c) continue;
    // 커트라인 파일의 "추첨단위 : 61130023 전북혁신 A10블럭"에서 이름만 떼어 쓴다
    const complex = c.unit?.replace(/^\s*\d+\s*/, "").trim() || n.title;
    for (const r of c.rows) {
      out.push({
        pan_id: n.pan_id,
        unit_no: n.unit_no,
        complex,
        announced_at: n.announced_at,
        draw_type: r.draw_type,
        households: r.households,
        applicants: r.applicants,
        competition: r.competition,
        closed_rank: r.closed_rank,
      });
    }
  }
  log(`커트라인 ${tried}건 시도 → 결과 ${out.length}행`);
  return out;
}
