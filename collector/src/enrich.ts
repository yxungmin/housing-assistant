/**
 * 번들 데이터(apps/mobile/data/announcements.json)에 좌표·주변·시세·대기현황·통근을 채운다.
 *   npm run app:enrich
 *
 * Supabase가 붙기 전까지 쓰는 다리다. 수집기(run.ts)는 같은 일을 DB에 하고,
 * 이 스크립트는 같은 값을 앱 번들 파일에 직접 넣는다.
 * 이미 채워진 공고는 건너뛰므로 여러 번 돌려도 API 호출이 늘지 않는다 (--force로 다시 채운다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./config";
import { geocodeAddress } from "./geo/kakao";
import { isUsable, RentClient } from "./market/rent";
import { fromRoot } from "./paths";
import { commuteTable } from "./transit/table";
import { WaitClient } from "./wait/myhome";

const TARGET = fromRoot("apps", "mobile", "data", "announcements.json");
const env = loadEnv();
const force = process.argv.includes("--force");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;

interface Row {
  id: string;
  title: string;
  status: string;
  region_code: string;
  address?: string;
  lat?: number;
  lng?: number;
  transit?: unknown;
  nearby?: unknown;
  market?: unknown;
  waiting?: unknown;
  commute?: unknown;
  extraction: { address?: string; tracks: { unit_types: { exclusive_area_m2?: number }[] }[] };
}

const rows = JSON.parse(readFileSync(TARGET, "utf8")) as Row[];
const regions = env.COLLECT_REGIONS.split(",").map((r) => r.trim()).filter(Boolean);

/** 시세를 비교할 기준 면적: 가장 많이 나오는 전용면적 */
function representativeArea(r: Row): number | undefined {
  const areas = r.extraction.tracks.flatMap((t) => t.unit_types.map((u) => u.exclusive_area_m2)).filter((a): a is number => typeof a === "number" && a > 0);
  if (areas.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const a of areas) counts.set(a, (counts.get(a) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]![0];
}

let changed = 0;
for (const row of rows) {
  if (only && row.id !== only) continue;
  if (row.status !== "VERIFIED" && row.status !== "AUTO") continue;
  const address = row.address ?? row.extraction.address;
  if (!address) {
    console.log(`${row.id}: 주소 없음 — 건너뜀`);
    continue;
  }
  if (!force && row.lat !== undefined && row.market !== undefined && row.commute !== undefined && (row as Row & { b_code?: string }).b_code !== undefined) {
    console.log(`${row.id}: 이미 채워짐 — 건너뜀`);
    continue;
  }

  console.log(`${row.id}: ${row.title.slice(0, 40)}`);
  // 1) 좌표·주변 (다른 셋의 전제)
  // 좌표가 손으로 넣은 값이면 법정동 코드가 없다. 시세 조회에 필요하므로 그때도 지오코딩한다.
  if (force || row.lat === undefined || (row as Row & { b_code?: string }).b_code === undefined) {
    const geo = env.KAKAO_REST_API_KEY ? await geocodeAddress(address, env.KAKAO_REST_API_KEY).catch(() => null) : null;
    if (geo) {
      row.lat = geo.lat;
      row.lng = geo.lng;
      row.transit = geo.transit;
      row.nearby = geo.nearby;
      (row as Row & { b_code?: string }).b_code = geo.b_code;
      console.log(`  좌표 ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)} · 법정동 ${geo.b_code ?? "?"} · 주변 ${geo.nearby.length}곳`);
    } else {
      console.log(`  좌표 실패 — 나머지도 건너뜀`);
      continue;
    }
  }
  const bCode = (row as Row & { b_code?: string }).b_code;

  // 2) 주변 시세
  const area = representativeArea(row);
  // 법정동 코드가 시군구보다 굵으면(1100000000 = 서울 전체) 시세가 이 단지 것이 아니다.
  const preciseDong = !!bCode && bCode.slice(2, 5) !== "000";
  if ((force || row.market === undefined) && preciseDong && area && env.MOLIT_API_KEY) {
    const m = await new RentClient(env.MOLIT_API_KEY).summary(bCode.slice(0, 5), area).catch(() => null);
    if (m && isUsable(m)) {
      row.market = m;
      console.log(`  시세 ${m.deals}건 · 전세 중앙값 ${(m.jeonse_median! / 100_000_000).toFixed(2)}억`);
    } else console.log(`  시세 표본 부족 — 넣지 않음`);
  }

  // 3) 대기현황
  if ((force || row.waiting === undefined) && env.MYHOME_API_KEY) {
    const w = await new WaitClient(env.MYHOME_API_KEY).forAnnouncement(row.region_code, row.title, address).catch(() => null);
    if (w) {
      row.waiting = w;
      console.log(`  대기 ${w.complex} ${w.total_waiting}명`);
    } else console.log(`  대기현황 단지 못 맞춤`);
  }

  // 4) 통근 (시군구 × 이 단지)
  if ((force || row.commute === undefined) && row.lat !== undefined && env.TRANSIT_API_KEY) {
    const t = await commuteTable({ lat: row.lat, lng: row.lng! }, regions, env.TRANSIT_API_KEY).catch(() => undefined);
    if (t) {
      row.commute = t;
      const vals = Object.values(t).map((v) => v.minutes);
      console.log(`  통근 ${Object.keys(t).length}곳 · ${Math.min(...vals)}~${Math.max(...vals)}분`);
    } else console.log(`  통근 경로 없음`);
  }
  changed++;
}

writeFileSync(TARGET, JSON.stringify(rows, null, 1));
console.log(`\n${changed}건 갱신 → ${TARGET}`);
