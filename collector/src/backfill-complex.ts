/**
 * 이미 서버에 있는 공고에 단지명(`complex`)만 채운다.
 *
 * 왜 따로 만드는가: `collect`는 `EXTRACTION_ENABLED=false`면 통째로 dry-run이 된다
 * (run.ts의 `dryRun = ... || extractionOff`). 비용 게이트가 제대로 도는 것이지만,
 * 그래서 추출을 켜지 않고는 단지명 하나도 못 채운다. 추출을 켜면 돈이 나간다.
 *
 * 단지명은 LH **상세 API**(`dsSbd.LCC_NT_NM`)가 그냥 준다. 공고문을 읽을 일이 없다.
 * 그래서 **LLM을 쓰지 않는다.** 지난 회차 결과를 이을 때 이 이름이 열쇠다
 * (packages/engine/src/results.ts).
 *
 * SH는 건너뛴다. 게시판 HTML이라 이 값이 없다.
 *
 *   npm run backfill:complex           무엇이 바뀔지만 보여 준다
 *   npm run backfill:complex -- --apply  실제로 쓴다
 */
import { LhClient, parseNoticeDetail } from "./lh/api";
import { loadEnv } from "./config";

const apply = process.argv.includes("--apply");
const env = loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다");
if (!env.LH_API_KEY) throw new Error("LH_API_KEY 가 필요하다");

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

interface Row {
  id: string;
  lh_id: string;
  provider: string;
  title: string;
  complex: string | null;
}

const rows = (await (await fetch(`${url}/rest/v1/announcements?select=id,lh_id,provider,title,complex`, { headers })).json()) as Row[];
const targets = rows.filter((r) => r.provider !== "SH" && !r.complex);
console.log(`공고 ${rows.length}건 · 단지명 없는 LH 공고 ${targets.length}건${apply ? "" : " (미리보기 — 쓰려면 --apply)"}`);

// 상세를 부르려면 목록이 주는 코드들이 필요하다. 목록을 한 번만 받아 PAN_ID로 찾는다.
const lh = new LhClient(env.LH_API_KEY);
const notices = await lh.listAllHousingNotices({});
const byPan = new Map(notices.map((n) => [n.lh_id, n]));
console.log(`LH 목록 ${notices.length}건`);

let filled = 0;
let noName = 0;
let notListed = 0;
for (const r of targets) {
  const n = byPan.get(r.lh_id);
  if (!n) {
    notListed++;
    continue; // 접수가 끝나 목록에서 빠진 공고. 상세를 부를 코드가 없다.
  }
  const raw = await lh.getNoticeDetail(n).catch(() => null);
  const complex = raw ? parseNoticeDetail(raw).complex_name?.trim() : undefined;
  if (!complex) {
    noName++;
    continue;
  }
  console.log(`  ${r.title.slice(0, 40)}  →  ${complex}`);
  if (apply) {
    const res = await fetch(`${url}/rest/v1/announcements?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { ...headers, prefer: "return=minimal" },
      body: JSON.stringify({ complex }),
    });
    if (!res.ok) {
      console.error(`   ✗ 쓰기 실패 HTTP ${res.status}`);
      continue;
    }
  }
  filled++;
}

console.log(`\n단지명 ${filled}건${apply ? " 채움" : " 채울 수 있음"} · 상세에 이름 없음 ${noName}건 · 목록에 없음(마감) ${notListed}건`);
