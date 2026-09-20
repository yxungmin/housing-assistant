/**
 * 앱 로컬 데이터 생성 (Supabase 연결 전 임시).
 * benchmark/output/*.draft.json (또는 fixtures/*.json) + benchmark/pdfs/meta.json → apps/mobile/data/announcements.json
 *   npm run app:data
 * 앱은 이 파일을 번들에 포함해 매칭·계산을 돌린다. Supabase가 붙으면 같은 형태를 app_announcements 뷰에서 받는다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ExtractionOutput, type HousingType } from "@housing/schema";
import type { PdfMeta } from "./fetch-pdfs";
import { fromRoot } from "./paths";

const OUT = fromRoot("benchmark", "output");
const FIXTURES = fromRoot("benchmark", "fixtures");
const META_PATH = fromRoot("benchmark", "pdfs", "meta.json");
const TARGET = fromRoot("apps", "mobile", "data", "announcements.json");

interface Meta {
  lh_id: string;
  region_code: string;
  region_name: string;
  apply_start?: string;
  apply_end?: string;
  lat?: number;
  lng?: number;
  transit?: { nearest_station?: string; station_walk_min?: number };
}

/** 초기 벤치마크 PDF(001~004)는 API 메타 없이 받았으므로 손으로 채운 값. 접수일은 시안 기준일(2026-09-20) 근처. */
const MANUAL_META: Record<string, Meta> = {
  "001": { lh_id: "MOCK-001", region_code: "41", region_name: "경기 과천시", apply_start: "2026-09-30", apply_end: "2026-10-02", lat: 37.4316, lng: 126.9982, transit: { nearest_station: "인덕원역", station_walk_min: 22 } },
  "002": { lh_id: "MOCK-002", region_code: "11", region_name: "서울 관악구", apply_start: "2026-09-25", apply_end: "2026-09-29", lat: 37.4784, lng: 126.9517, transit: { nearest_station: "봉천역", station_walk_min: 9 } },
  "003": { lh_id: "MOCK-003", region_code: "11", region_name: "서울", apply_start: "2026-09-23", apply_end: "2026-09-30", lat: 37.5665, lng: 126.978, transit: {} },
  "004": { lh_id: "MOCK-004", region_code: "11", region_name: "서울 마포구", apply_start: "2026-09-22", apply_end: "2026-10-06", lat: 37.5586, lng: 126.9095, transit: { nearest_station: "망원역", station_walk_min: 7 } },
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
  const sido = SIDO[m.region_code] ?? m.region_name;
  const sigungu = m.address?.split(/\s+/)[1];
  return {
    lh_id: m.lh_id,
    region_code: m.region_code,
    region_name: sigungu ? `${sido} ${sigungu}` : sido,
    apply_start: m.apply_start,
    apply_end: m.apply_end,
    ...MANUAL_COORDS[m.id],
  };
}

export interface AppAnnouncement {
  id: string;
  lh_id: string;
  title: string;
  housing_type: HousingType;
  region_code: string;
  region_name: string;
  status: "VERIFIED" | "UNVERIFIED";
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  lat?: number;
  lng?: number;
  transit?: { nearest_station?: string; station_walk_min?: number };
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
  // 앱 로컬 데이터는 사람이 검토한 것으로 간주해 verified=true (실제 서비스는 publish_version()이 한다)
  const extraction = {
    ...parsed.data,
    tracks: parsed.data.tracks.map((t) => ({ ...t, rules: t.rules.map((r) => ({ ...r, verified: true })) })),
  };
  items.push({
    id,
    lh_id: meta?.lh_id ?? `MOCK-${id}`,
    title: parsed.data.title,
    housing_type: parsed.data.housing_type,
    region_code: meta?.region_code ?? "00",
    region_name: meta?.region_name ?? "",
    status: "VERIFIED",
    notice_date: parsed.data.schedule.notice_date,
    apply_start: meta?.apply_start ?? parsed.data.schedule.apply_start,
    apply_end: meta?.apply_end ?? parsed.data.schedule.apply_end,
    address: parsed.data.address,
    lat: meta?.lat,
    lng: meta?.lng,
    transit: meta?.transit,
    extraction,
  });
}
// "분석 중" 상태 예시 1건 (검수 전 공고가 앱에서 어떻게 보이는지)
items.push({
  id: "pending-001",
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
mkdirSync(join(TARGET, ".."), { recursive: true });
writeFileSync(TARGET, JSON.stringify(items, null, 1));
console.log(`wrote ${TARGET} (${items.length}건: ${items.map((i) => i.id).join(", ")})`);
