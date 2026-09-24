/**
 * 앱 로컬 데이터 생성 (Supabase 연결 전 임시).
 * benchmark/output/*.draft.json (또는 fixtures/*.json) + benchmark/pdfs/meta.json → apps/mobile/data/announcements.json
 *   npm run app:data
 * 앱은 이 파일을 번들에 포함해 매칭·계산을 돌린다. Supabase가 붙으면 같은 형태를 app_announcements 뷰에서 받는다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ExtractionOutput, regionNameOf, SERVICE_REGION_LABEL, SERVICE_REGIONS, type HousingType } from "@housing/schema";
import { advisoryChecks, autoChecks, blockingChecks } from "./validate/autoChecks";
import type { PdfMeta } from "./fetch-pdfs";
import { fromRoot } from "./paths";

const OUT = fromRoot("benchmark", "output");
const FIXTURES = fromRoot("benchmark", "fixtures");
const META_PATH = fromRoot("benchmark", "pdfs", "meta.json");
const TARGET = fromRoot("apps", "mobile", "data", "announcements.json");

interface Meta {
  provider?: "LH" | "SH";
  pdf_url?: string;
  lh_id: string;
  region_code: string;
  region_name: string;
  apply_start?: string;
  apply_end?: string;
  lat?: number;
  lng?: number;
  transit?: { nearest_station?: string; station_walk_min?: number; station_distance_m?: number; nearest_bus_stop?: string; bus_walk_min?: number; bus_distance_m?: number };
  nearby?: { kind: string; name: string; distance_m: number }[];
  market?: Record<string, unknown>;
  waiting?: Record<string, unknown>;
  commute?: Record<string, { minutes: number; transfers: number }>;
  maintenance?: Record<string, unknown>;
}

/**
 * 초기 벤치마크 PDF(001~004)는 API 메타 없이 받았으므로 손으로 채운 값.
 *
 * 전에는 접수일도 여기서 시안 기준일(2026-09-20) 근처로 옮겨 적었다. 그 결과 2024년 공고가
 * "공고일 2024.12 · 당첨자 발표 2025.04 · 접수 D-7"로 서버까지 올라가 실제 공고처럼 보였다(2026-09-23 발견).
 * 날짜는 이제 공고문에서 읽은 값을 그대로 쓰고, 지난 공고는 아래에서 번들에 넣지 않는다.
 */
const MANUAL_META: Record<string, Meta> = {
  "001": { lh_id: "MOCK-001", region_code: "41", region_name: "경기 과천시", lat: 37.4316, lng: 126.9982,
    transit: { nearest_station: "인덕원역 4호선", station_walk_min: 22, station_distance_m: 1480, nearest_bus_stop: "과천지식정보타운", bus_walk_min: 3, bus_distance_m: 190 },
    nearby: [{ kind: "school", name: "과천문원초등학교", distance_m: 690 }, { kind: "mart", name: "이마트 과천점", distance_m: 1320 }, { kind: "convenience", name: "세븐일레븐 과천점", distance_m: 210 }] },
  "002": { lh_id: "MOCK-002", region_code: "11", region_name: "서울 관악구", lat: 37.4784, lng: 126.9517,
    transit: { nearest_station: "봉천역 2호선", station_walk_min: 9, station_distance_m: 620, nearest_bus_stop: "관악구청", bus_walk_min: 4, bus_distance_m: 250 },
    nearby: [{ kind: "school", name: "봉천중학교", distance_m: 540 }, { kind: "convenience", name: "CU 봉천역점", distance_m: 160 }, { kind: "hospital", name: "에이치플러스 양지병원", distance_m: 1100 }] },
  "003": { lh_id: "MOCK-003", region_code: "11", region_name: "서울", lat: 37.5665, lng: 126.978, transit: {} },
  "004": { lh_id: "MOCK-004", region_code: "11", region_name: "서울 마포구", lat: 37.5586, lng: 126.9095,
    transit: { nearest_station: "망원역 6호선", station_walk_min: 7, station_distance_m: 470, nearest_bus_stop: "망원역2번출구", bus_walk_min: 2, bus_distance_m: 130 },
    nearby: [{ kind: "daycare", name: "망원어린이집", distance_m: 240 }, { kind: "school", name: "망원초등학교", distance_m: 320 }, { kind: "mart", name: "망원시장", distance_m: 410 }, { kind: "convenience", name: "GS25 망원점", distance_m: 90 }, { kind: "hospital", name: "마포구립서부노인전문병원", distance_m: 1480 }, { kind: "park", name: "망원한강공원", distance_m: 760 }] },
  "005": { lh_id: "2015122300020801", region_code: "45", region_name: "전북 군산시", apply_start: "2026-09-29", apply_end: "2026-09-29", lat: 35.9676, lng: 126.7106, transit: {} },
};

/** Kakao 지오코딩 전까지 주소로 손으로 잡은 좌표 (단지 위치, 수백 m 오차). 수집기가 붙으면 announcements.lat/lng가 대신한다. */
const MANUAL_COORDS: Record<string, { lat: number; lng: number }> = {
  "007": { lat: 33.512, lng: 126.535 }, // 제주 일도이동
  "008": { lat: 37.553, lng: 126.87 }, // 서울 강서구 염창동
  "009": { lat: 37.185, lng: 127.108 }, // 화성 동탄2
  "010": { lat: 35.317, lng: 128.997 }, // 양산 물금읍
  "011": { lat: 37.152, lng: 128.951 }, // 태백 소도동
};

const SIDO: Record<string, string> = {
  "11": "서울", "41": "경기", "28": "인천", "26": "부산", "27": "대구", "29": "광주", "30": "대전", "31": "울산", "36": "세종",
  "42": "강원", "43": "충북", "44": "충남", "45": "전북", "46": "전남", "47": "경북", "48": "경남", "50": "제주",
};

function metaFromApi(m: PdfMeta): Meta {
  // 시군구 라벨 규칙은 schema places.ts 한 곳 (앱·수집기와 같다)
  const regionName = regionNameOf(m.region_code, m.address, SIDO[m.region_code] ?? m.region_name);
  return {
    provider: m.provider,
    pdf_url: m.pdf_url,
    lh_id: m.lh_id,
    region_code: m.region_code,
    region_name: regionName,
    apply_start: m.apply_start,
    apply_end: m.apply_end,
    ...MANUAL_COORDS[m.id],
  };
}

export type DataStatus = "VERIFIED" | "AUTO" | "UNVERIFIED";

export interface AppAnnouncement {
  id: string;
  provider: "LH" | "SH";
  lh_id: string;
  title: string;
  housing_type: HousingType;
  region_code: string;
  region_name: string;
  /** VERIFIED 사람이 공고문과 대조함 / AUTO 자동 추출·검증만 / UNVERIFIED 아직 조건을 못 읽음 */
  status: DataStatus;
  /** 자동 검증에서 걸린 것 (있으면 화면에 그대로 알린다) */
  checks?: string[];
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  lat?: number;
  lng?: number;
  transit?: { nearest_station?: string; station_walk_min?: number; station_distance_m?: number; nearest_bus_stop?: string; bus_walk_min?: number; bus_distance_m?: number };
  nearby?: { kind: string; name: string; distance_m: number }[];
  /** 기관 사이트의 원문 공고문. 앱이 근거 쪽수를 실제로 열 수 있게 한다 */
  pdf_url?: string;
  pdf_pages?: number;
  extraction: ExtractionOutput;
}

const apiMeta: Record<string, Meta> = {};
if (existsSync(META_PATH)) for (const m of JSON.parse(readFileSync(META_PATH, "utf8")) as PdfMeta[]) apiMeta[m.id] = metaFromApi(m);

const files = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".draft.json")).sort() : [];
const items: AppAnnouncement[] = [];
for (const f of files) {
  const id = f.replace(".draft.json", "");
  const fixture = join(FIXTURES, `${id}.json`);
  const raw = JSON.parse(readFileSync(existsSync(fixture) ? fixture : join(OUT, f), "utf8"));
  const parsed = ExtractionOutput.safeParse(raw.gold);
  if (!parsed.success) {
    console.warn(`skip ${id}: ${parsed.error.issues[0]?.message}`);
    continue;
  }
  const meta = MANUAL_META[id] ?? apiMeta[id];
  // 사람이 본 것만 VERIFIED다. 초안은 사람이 본 적이 없으므로 AUTO로 두고 룰의 verified도 건드리지 않는다.
  // (전에는 여기서 전부 verified=true를 붙여, 검수하지 않은 LLM 추출이 앱에서 "검수 완료"로 보였다.)
  const extraction = parsed.data;
  const fromFixture = existsSync(fixture);
  // autoChecks는 "tracks[0] 1순위 (…): 가격 정보 없음"처럼 트랙별로 나온다.
  // 화면에는 트랙 이름을 빼고 같은 지적을 한 번만 보여 준다 (네 트랙이 같은 말을 하면 한 줄).
  const checked = autoChecks(extraction);
  const blocking = blockingChecks(checked);
  // 화면에는 트랙 이름을 빼고 같은 지적을 한 번만 보여 준다 (네 트랙이 같은 말을 하면 한 줄).
  const short = (m: string) => m.slice(m.lastIndexOf(": ") + 2);
  const issues = [...new Set(advisoryChecks(checked).map(short))];
  items.push({
    id,
    provider: meta?.provider ?? "LH",
    lh_id: meta?.lh_id ?? `MOCK-${id}`,
    title: parsed.data.title,
    housing_type: parsed.data.housing_type,
    region_code: meta?.region_code ?? "00",
    region_name: meta?.region_name ?? "",
    // 게시를 막을 지적이 있으면 조건을 믿을 수 없다 → 앱에서 "조건 분석 중"으로 둔다 (수집기의 CONFLICT와 같은 기준)
    status: blocking.length ? "UNVERIFIED" : fromFixture ? "VERIFIED" : "AUTO",
    checks: issues.length ? issues : undefined,
    notice_date: parsed.data.schedule.notice_date,
    apply_start: meta?.apply_start ?? parsed.data.schedule.apply_start,
    apply_end: meta?.apply_end ?? parsed.data.schedule.apply_end,
    address: parsed.data.address,
    lat: meta?.lat,
    lng: meta?.lng,
    transit: meta?.transit,
    nearby: meta?.nearby,
    pdf_url: meta?.pdf_url,
    extraction,
  });
}
// "분석 중" 상태 예시 1건 (검수 전 공고가 앱에서 어떻게 보이는지)
items.push({
  id: "pending-001",
  provider: "LH",
  lh_id: "0000061175",
  title: "시흥하중 A-4블록 신혼희망타운(공공분양) 잔여세대 추가입주자모집공고",
  housing_type: "newlywed_hope",
  region_code: "41",
  region_name: "경기 시흥시",
  status: "UNVERIFIED",
  notice_date: "2026-09-18",
  apply_end: "2026-09-29",
  extraction: { title: "", housing_type: "newlywed_hope", schedule: {}, tracks: [{ name: "-", unit_types: [], rule_groups: [], rules: [], pricing: [] }], notes: [] },
});
/**
 * 초안(benchmark/output/*.draft.json)과 정답(benchmark/fixtures/)은 커밋하지 않는 생성물이다.
 * 그게 없는 작업본에서 이 스크립트를 돌리면 "분석 중" 예시 1건만 남은 파일을 써서
 * 앱의 번들 데이터를 통째로 날린다. 실제로 한 번 날렸다 (2026-09-21).
 * 그래서 읽어 온 공고가 없으면 쓰지 않고 멈춘다 — 덮어쓰기는 되돌릴 수 없다.
 */
const fromSources = items.filter((i) => i.id !== "pending-001").length;
if (fromSources === 0) {
  console.error(`초안·정답을 하나도 못 읽었습니다 (${OUT}, ${FIXTURES}). ${TARGET}를 덮어쓰지 않고 멈춥니다.`);
  console.error("초안을 먼저 만드세요: npm run benchmark:fetch → npm run inspect -- <pdf> --extract");
  process.exit(1);
}

/**
 * 서버 뷰(app_announcements)와 같은 기준으로 지난 공고를 뺀다 — 마감 7일이 지나면 목록에서 내린다.
 * 번들은 서버가 안 붙었을 때 보이는 데이터라, 서버와 다른 공고가 보이면 안 된다.
 */
const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
const expired = items.filter((i) => i.apply_end && i.apply_end < cutoff);
if (expired.length) console.log(`마감 지난 공고 ${expired.length}건은 넣지 않습니다: ${expired.map((i) => `${i.id}(${i.apply_end})`).join(", ")}`);
/**
 * 서비스 지역 공고만 앱에 넣는다. 추출 벤치마크 PDF는 유형을 고루 모으려고 전국에서 받는데(benchmark:fetch),
 * 그걸 그대로 번들로 만들어 군산·제주·양산 공고가 서울 사람 앱에 떴다 (2026-09-24).
 * 수집기(COLLECT_REGIONS)와 같은 SERVICE_REGIONS 기준이다. 지역을 모르는 공고("00")도 넣지 않는다.
 * 다른 지역 공고를 앱에서 보려면 --all.
 */
const all = process.argv.includes("--all");
const outside = all ? [] : items.filter((i) => !(SERVICE_REGIONS as readonly string[]).includes(i.region_code));
if (outside.length) {
  console.log(`서비스 지역(${SERVICE_REGION_LABEL}) 밖 공고 ${outside.length}건은 넣지 않습니다: ${outside.map((i) => `${i.id}(${i.region_name || i.region_code})`).join(", ")}`);
}
const live = items.filter((i) => !expired.includes(i) && !outside.includes(i));
// 위의 "하나도 못 읽었으면 멈춘다"와 같은 이유 — 전부 지난 공고라 비었어도 덮어쓰지 않는다
if (live.filter((i) => i.id !== "pending-001").length === 0) {
  console.error(`남는 공고가 없습니다 (전부 마감 7일 경과). ${TARGET}를 덮어쓰지 않고 멈춥니다.`);
  process.exit(1);
}

/**
 * --only 012,008: 번들을 다시 만들지 않고 그 공고의 **추출 결과만** 갈아 끼운다.
 *
 * 번들에는 app:enrich가 외부 API로 채운 것(원문 링크·그림·좌표·시세·대기·통근·집 목록)이 들어 있다.
 * 새 프롬프트로 몇 건만 다시 추출했을 때 번들을 통째로 다시 만들면 그게 다 날아가고, 되살리려면
 * 하루 한도가 있는 API를 다시 불러야 한다. 그래서 추출에서 오는 값만 바꾼다.
 */
const onlyIdx = process.argv.indexOf("--only");
if (onlyIdx >= 0) {
  const ids = (process.argv[onlyIdx + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const bundle = JSON.parse(readFileSync(TARGET, "utf8")) as AppAnnouncement[];
  const replaced: string[] = [];
  for (const id of ids) {
    const next = live.find((i) => i.id === id);
    const at = bundle.findIndex((b) => b.id === id);
    if (!next || at < 0) {
      console.error(`${id}: ${!next ? "초안·정답이 없다" : "번들에 없다"} — 건너뜀`);
      continue;
    }
    const prev = bundle[at]!;
    bundle[at] = { ...prev, title: next.title, housing_type: next.housing_type, status: next.status, checks: next.checks, notice_date: next.notice_date, address: next.address ?? prev.address, extraction: next.extraction };
    replaced.push(id);
  }
  if (replaced.length === 0) process.exit(1);
  writeFileSync(TARGET, JSON.stringify(bundle, null, 1));
  console.log(`updated ${TARGET} (${replaced.join(", ")}의 추출 결과만 교체)`);
  process.exit(0);
}

mkdirSync(join(TARGET, ".."), { recursive: true });
writeFileSync(TARGET, JSON.stringify(live, null, 1));
console.log(`wrote ${TARGET} (${live.length}건: ${live.map((i) => i.id).join(", ")})`);
