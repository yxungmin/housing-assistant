/**
 * 번들 데이터(apps/mobile/data/announcements.json)에 원문 링크·단지 이미지·좌표·주변·시세·대기현황·통근을 채운다.
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
import { LhClient, parseNoticeDetail, pickNoticePdf, resolveImages, type LhImage, type LhNoticeSummary } from "./lh/api";
import { parseUnitList, pickUnitList } from "./units/list";
import type { SupplyUnit } from "@housing/schema";
import { shDetailUrl } from "./sh/api";
import { commuteTable } from "./transit/table";
import { WaitClient } from "./wait/myhome";

const TARGET = fromRoot("apps", "mobile", "data", "announcements.json");
const env = loadEnv();
const force = process.argv.includes("--force");
/** 원문 링크·그림만 다시 채운다. --force는 통근표까지 다시 불러 하루 한도를 크게 쓴다. */
const linksOnly = process.argv.includes("--links");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;

interface Row {
  id: string;
  provider?: string;
  lh_id?: string;
  title: string;
  status: string;
  region_code: string;
  address?: string;
  pdf_url?: string;
  detail_url?: string;
  images?: LhImage[];
  units?: SupplyUnit[];
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

/**
 * 원문 링크와 단지 이미지. 기관 목록·상세만 읽으면 되니 LLM도 PDF 다운로드도 없다.
 *
 * 초안으로 만든 번들 행에는 공고 주소가 통째로 없어서 앱이 "원문 주소가 아직 없어요"만 말했다.
 * 목록 응답에는 상세 페이지 주소가 언제나 들어 있고, 상세 응답에는 공고문 PDF와
 * 단지 이미지(위치도·단지조감도)가 있다. lh_id가 진짜인 행에만 붙는다 (MOCK-*는 건너뛴다).
 */
async function fillSourceLinks(): Promise<number> {
  // SH 상세 주소는 게시판 seq만 있으면 만들어진다. 호출이 필요 없으니 먼저 채운다.
  for (const r of rows) {
    if (r.provider === "SH" && r.lh_id && (force || linksOnly || r.detail_url === undefined)) r.detail_url = shDetailUrl(r.lh_id);
  }
  const refill = force || linksOnly;
  const targets = rows.filter((r) => r.provider === "LH" && r.lh_id && !r.lh_id.startsWith("MOCK") && (refill || r.detail_url === undefined));
  if (targets.length === 0) return rows.filter((r) => r.provider === "SH" && r.detail_url).length > 0 ? 1 : 0;
  if (!env.LH_API_KEY) {
    console.log(`원문 링크: LH_API_KEY 없음 — ${targets.length}건 건너뜀`);
    return 0;
  }
  const client = new LhClient(env.LH_API_KEY);
  const index = new Map<string, LhNoticeSummary>();
  for (const n of await client.listAllHousingNotices()) index.set(n.lh_id, n);
  let filled = 0;
  for (const row of targets) {
    const summary = index.get(row.lh_id!);
    if (!summary) {
      console.log(`${row.id}: 목록에 없음 (최근 90일 밖) — 링크 건너뜀`);
      continue;
    }
    row.detail_url = summary.detail_url;
    const detail = await client.getNoticeDetail(summary).then(parseNoticeDetail).catch(() => null);
    if (detail) {
      // 기관이 준 주소를 그대로 쓴다. 우리 Storage에 올리는 것은 Supabase를 붙일 때 한다.
      row.pdf_url = pickNoticePdf(detail.attachments)?.url ?? row.pdf_url;
      // 주소를 한 번 펼쳐야 앱이 그림으로 띄울 수 있다 (resolveImages 주석 참고)
      const images = detail.images.length ? await resolveImages(detail.images) : [];
      // 못 구했으면 지운다. 예전 값을 남겨 두면 고쳐 놓고도 깨진 주소가 그대로 나간다.
      row.images = images.length ? images : undefined;

      // 매입임대·전세임대는 집이 흩어져 있고 그 목록이 별도 엑셀 첨부에 있다.
      // 목록이 없으면 이 공고에서 사용자가 고를 수 있는 것이 아무것도 없다.
      const listFile = pickUnitList(detail.attachments);
      if (listFile) {
        const bytes = await client.download(listFile.url).catch(() => null);
        row.units = bytes ? parseUnitList(Buffer.from(bytes)) : undefined;
        if (row.units?.length === 0) row.units = undefined;
      }
    }
    console.log(`${row.id}: 상세 링크 · 공고문 ${row.pdf_url ? "있음" : "없음"} · 이미지 ${row.images?.length ?? 0}장${row.units ? ` · 주택목록 ${row.units.length}호` : ""}`);
    filled++;
  }
  return filled;
}

/**
 * 지금까지 채운 것을 바로 파일에 쓴다.
 *
 * 처음에는 마지막에 한 번만 썼는데, 공고 하나에서 통근표(시군구 56회)를 만드는 동안
 * 프로세스가 끊기면 그 앞의 API 호출 결과가 통째로 날아갔다. 호출은 하루 한도가 있는 자원이다.
 */
const save = () => writeFileSync(TARGET, JSON.stringify(rows, null, 1));

/**
 * 흩어진 집의 좌표.
 *
 * 한 건물에 여러 세대가 있어 주소는 겹친다. 그래서 지오코딩 호출은 집 수가 아니라 주소 수만큼이다
 * (실측: 81호에 주소 30여 곳). 이 좌표가 없으면 목록이 있어도 "내 직장에서 가까운 집"을 고를 수 없고,
 * 그러면 목록을 읽어 온 의미가 절반이다.
 *
 * 링크·목록과 한 묶음으로 돌린다. 아래 본 루프는 이미 채워진 공고를 통째로 건너뛰는데,
 * 좌표·시세가 이미 있는 공고에도 주택 목록은 새로 붙기 때문이다.
 */
async function fillUnitCoords(): Promise<number> {
  const targets = rows.filter((r) => r.units?.length && (force || r.units.some((u) => u.lat === undefined)));
  if (targets.length === 0) return 0;
  if (!env.KAKAO_REST_API_KEY) {
    console.log(`주택 좌표: KAKAO_REST_API_KEY 없음 — ${targets.length}건 건너뜀`);
    return 0;
  }
  let filled = 0;
  for (const row of targets) {
    const seen = new Map<string, { lat: number; lng: number } | null>();
    for (const unit of row.units!) {
      if (!force && unit.lat !== undefined) continue;
      let at = seen.get(unit.address);
      if (at === undefined) {
        const geo = await geocodeAddress(unit.address, env.KAKAO_REST_API_KEY).catch(() => null);
        at = geo ? { lat: geo.lat, lng: geo.lng } : null;
        seen.set(unit.address, at);
      }
      if (at) {
        unit.lat = at.lat;
        unit.lng = at.lng;
      }
    }
    const found = row.units!.filter((u) => u.lat !== undefined).length;
    console.log(`${row.id}: 주택 좌표 ${found}/${row.units!.length}호 (주소 ${seen.size}곳)`);
    filled++;
    save();
  }
  return filled;
}

let changed = await fillSourceLinks();
if (changed > 0) save();
changed += await fillUnitCoords();
if (linksOnly) {
  console.log(`\n원문 링크·그림 ${changed}건 갱신 → ${TARGET}`);
  process.exit(0);
}

/** 시세를 비교할 기준 면적: 가장 많이 나오는 전용면적 */
function representativeArea(r: Row): number | undefined {
  const areas = r.extraction.tracks.flatMap((t) => t.unit_types.map((u) => u.exclusive_area_m2)).filter((a): a is number => typeof a === "number" && a > 0);
  if (areas.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const a of areas) counts.set(a, (counts.get(a) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]![0];
}

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
  if ((force || row.commute === undefined) && row.lat !== undefined) {
    const t = await commuteTable({ lat: row.lat, lng: row.lng! }, regions, { kakao: env.KAKAO_REST_API_KEY, seoul: env.TRANSIT_API_KEY }).catch(() => undefined);
    if (t) {
      row.commute = t;
      const vals = Object.values(t).map((v) => v.minutes);
      console.log(`  통근 ${Object.keys(t).length}곳 · ${Math.min(...vals)}~${Math.max(...vals)}분`);
    } else console.log(`  통근 경로 없음`);
  }
  changed++;
  save();
}

save();
console.log(`\n${changed}건 갱신 → ${TARGET}`);
