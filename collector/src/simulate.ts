/**
 * 프로필을 바꿔 가며 지금 공고 데이터에 돌려 본다.
 *   npm run simulate            요약
 *   npm run simulate -- --full  프로필마다 공고별 판정까지
 *
 * 왜 필요한가: 화면에서 내 정보를 한 번씩 바꿔 보는 것으로는 조합을 다 못 본다.
 * 나이·혼인·가구원·소득·자산만 해도 경우가 수십 가지고, 사람이 손으로 돌리면 이상한 결과를
 * 발견해도 어떤 조합이었는지 되짚기 어렵다. 엔진은 순수 함수라 여기서 그냥 돌리면 된다.
 *
 * 보는 것은 셋이다.
 *  1. 거리 — 서울 사는 사람에게 제주 공고가 위에 오는가 (listDistanceKm의 근거)
 *  2. 과대적합 — 아무 조건이나 다 "일치"로 나오는가. 모든 프로필이 모든 공고에 맞으면 판정이 아니다.
 *  3. 빈칸 — "확인 필요"만 잔뜩 나오는 프로필이 있는가. 그런 사람에게 이 앱은 아무 말도 못 한 셈이다.
 */
import { readFileSync } from "node:fs";
import { haversineKm, matchAnnouncement, ruleCounts } from "@housing/engine";
import { placeFor, type UserProfile } from "@housing/schema";
import { fromRoot } from "./paths";

interface Row {
  id: string;
  title: string;
  status: string;
  region_code: string;
  lat?: number;
  lng?: number;
  apply_end?: string;
  extraction: { tracks: unknown[] };
}

const rows = JSON.parse(readFileSync(fromRoot("apps", "mobile", "data", "announcements.json"), "utf8")) as Row[];
const readable = rows.filter((r) => r.status === "VERIFIED" || r.status === "AUTO");
const full = process.argv.includes("--full");

/** 실제로 있을 법한 사람들. 극단값이 아니라 흔한 경우를 고른다. */
const PROFILES: { name: string; profile: UserProfile }[] = [
  {
    name: "서울 청년 1인 (28세, 사회초년생)",
    profile: {
      region_code: "11", region_sigungu: "서울 관악구", birth_date: "1998-03-15", age: 28,
      marriage: "single", household_size: 1, children_count: 0, children_ages: [],
      income_type: "single", annual_income: 33_600_000, monthly_income: 2_800_000,
      total_assets: 32_000_000, car_value: 0, monthly_debt_payment: 0,
      is_homeless: true, homeless_months: 0, cash_on_hand: 20_000_000,
      statuses: ["new_worker"], subscription_months: 31, subscription_deposits: 31, subscription_active: true,
    },
  },
  {
    name: "서울 대학생 (22세)",
    profile: {
      region_code: "11", region_sigungu: "서울 동대문구", birth_date: "2004-05-02", age: 22,
      marriage: "single", household_size: 1, children_count: 0, children_ages: [],
      income_type: "single", annual_income: 6_000_000, monthly_income: 500_000,
      total_assets: 3_000_000, car_value: 0, monthly_debt_payment: 0,
      is_homeless: true, homeless_months: 0, cash_on_hand: 3_000_000,
      statuses: ["student"], subscription_months: 6, subscription_deposits: 6, subscription_active: true,
    },
  },
  {
    name: "서울 신혼부부 맞벌이 (33세, 자녀 1)",
    profile: {
      region_code: "11", region_sigungu: "서울 마포구", birth_date: "1993-07-20", age: 33,
      marriage: "married", marriage_years: 3, household_size: 3, children_count: 1, children_ages: [2],
      income_type: "dual", annual_income: 96_000_000, monthly_income: 8_000_000,
      total_assets: 150_000_000, car_value: 20_000_000, monthly_debt_payment: 300_000,
      is_homeless: true, homeless_months: 78, cash_on_hand: 60_000_000,
      statuses: [], subscription_months: 96, subscription_deposits: 96, subscription_active: true,
    },
  },
  {
    name: "경기 신혼부부 외벌이 (35세, 자녀 2)",
    profile: {
      region_code: "41", region_sigungu: "경기 과천시", birth_date: "1991-01-09", age: 35,
      marriage: "married", marriage_years: 6, household_size: 4, children_count: 2, children_ages: [1, 4],
      income_type: "single", annual_income: 60_000_000, monthly_income: 5_000_000,
      total_assets: 200_000_000, car_value: 15_000_000, monthly_debt_payment: 500_000,
      is_homeless: true, homeless_months: 66, cash_on_hand: 40_000_000,
      statuses: [], subscription_months: 120, subscription_deposits: 120, subscription_active: true,
    },
  },
  {
    name: "서울 한부모 (38세, 자녀 1)",
    profile: {
      region_code: "11", region_sigungu: "서울 노원구", birth_date: "1988-11-03", age: 38,
      marriage: "single_parent", household_size: 2, children_count: 1, children_ages: [6],
      income_type: "single", annual_income: 36_000_000, monthly_income: 3_000_000,
      total_assets: 50_000_000, car_value: 5_000_000, monthly_debt_payment: 0,
      is_homeless: true, homeless_months: 96, cash_on_hand: 15_000_000,
      statuses: ["single_parent_support"], subscription_months: 60, subscription_deposits: 60, subscription_active: true,
    },
  },
  {
    name: "서울 고령 1인 (68세, 수급자)",
    profile: {
      region_code: "11", region_sigungu: "서울 강서구", birth_date: "1958-02-14", age: 68,
      marriage: "single", household_size: 1, children_count: 0, children_ages: [],
      income_type: "single", annual_income: 12_000_000, monthly_income: 1_000_000,
      total_assets: 20_000_000, car_value: 0, monthly_debt_payment: 0,
      is_homeless: true, homeless_months: 300, cash_on_hand: 5_000_000,
      statuses: ["basic_livelihood"], subscription_months: 0, subscription_deposits: 0, subscription_active: false,
    },
  },
  {
    name: "고소득 맞벌이 (40세, 자산 많음)",
    profile: {
      region_code: "11", region_sigungu: "서울 강남구", birth_date: "1986-06-01", age: 40,
      marriage: "married", marriage_years: 12, household_size: 4, children_count: 2, children_ages: [8, 11],
      income_type: "dual", annual_income: 180_000_000, monthly_income: 15_000_000,
      total_assets: 900_000_000, car_value: 60_000_000, monthly_debt_payment: 2_000_000,
      is_homeless: true, homeless_months: 120, cash_on_hand: 300_000_000,
      statuses: [], subscription_months: 200, subscription_deposits: 200, subscription_active: true,
    },
  },
  {
    name: "유주택자 (45세)",
    profile: {
      region_code: "11", region_sigungu: "서울 송파구", birth_date: "1981-09-09", age: 45,
      marriage: "married", marriage_years: 15, household_size: 3, children_count: 1, children_ages: [10],
      income_type: "dual", annual_income: 84_000_000, monthly_income: 7_000_000,
      total_assets: 600_000_000, car_value: 30_000_000, monthly_debt_payment: 1_500_000,
      is_homeless: false, cash_on_hand: 50_000_000,
      statuses: [], subscription_months: 150, subscription_deposits: 150, subscription_active: true,
    },
  },
  {
    name: "지방 거주 (전북 군산, 30세)",
    profile: {
      region_code: "45", region_sigungu: "전북 군산시", birth_date: "1996-04-18", age: 30,
      marriage: "single", household_size: 1, children_count: 0, children_ages: [],
      income_type: "single", annual_income: 30_000_000, monthly_income: 2_500_000,
      total_assets: 25_000_000, car_value: 8_000_000, monthly_debt_payment: 0,
      is_homeless: true, homeless_months: 5, cash_on_hand: 10_000_000,
      statuses: [], subscription_months: 24, subscription_deposits: 24, subscription_active: true,
    },
  },
  {
    name: "정보 거의 없음 (필수만)",
    profile: {
      region_code: "11", birth_date: "1995-01-01", age: 31,
      marriage: "single", household_size: 1,
      monthly_income: 3_000_000, total_assets: 40_000_000,
      is_homeless: true, cash_on_hand: 10_000_000,
    },
  },
];

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

/** 목록 정렬에 쓰는 거리. 앱의 listDistanceKm와 같은 규칙이다 (내 지역이 -1) */
function listKm(row: Row, p: UserProfile): number {
  if (p.region_code && row.region_code === p.region_code) return -1;
  const at = p.region_sigungu ? p.region_sigungu.split(" ") : null;
  const home = at ? placeFor(p.region_code!, at.slice(1).join(" ")) : p.region_code ? placeFor(p.region_code) : null;
  if (!home || row.lat === undefined || row.lng === undefined) return Number.MAX_SAFE_INTEGER;
  return haversineKm(home, { lat: row.lat, lng: row.lng });
}

interface Summary {
  name: string;
  matched: number;
  total: number;
  avgMatchedRules: number;
  avgNeedsCheck: number;
  farMatches: { id: string; km: number; title: string }[];
  allNeedsCheck: number;
}

const summaries: Summary[] = [];

for (const { name, profile } of PROFILES) {
  let matched = 0;
  let matchedRules = 0;
  let needsCheck = 0;
  let allNeedsCheck = 0;
  const farMatches: Summary["farMatches"] = [];
  const lines: string[] = [];

  for (const row of readable) {
    const result = matchAnnouncement(row.extraction as never, profile, { announcement_region: row.region_code, announcement_title: row.title });
    const best = result.best_track ?? [...result.tracks].sort((a, b) => b.summary.matched - a.summary.matched)[0];
    const counts = best ? ruleCounts(best) : { matched: 0, needsCheck: 0, total: 0 };
    const km = listKm(row, profile);
    if (result.is_match) {
      matched++;
      matchedRules += counts.matched;
      needsCheck += counts.needsCheck;
      if (counts.total > 0 && counts.matched === 0) allNeedsCheck++;
      // 200km 넘게 떨어진 곳이 "조건 일치"로 뜨면 목록에서 사람을 헷갈리게 한다
      if (km > 200 && km !== Number.MAX_SAFE_INTEGER) farMatches.push({ id: row.id, km, title: row.title.slice(0, 24) });
    }
    if (full) {
      lines.push(
        `    ${pad(row.id, 12)} 지역${row.region_code} ${pad(km === -1 ? "내 지역" : km === Number.MAX_SAFE_INTEGER ? "?" : `${km.toFixed(0)}km`, 8)}` +
          `${result.is_match ? "일치" : "불가"}  규칙 ${counts.matched}/${counts.total}${counts.needsCheck ? ` 확인 ${counts.needsCheck}` : ""}  ${row.title.slice(0, 26)}`,
      );
    }
  }

  summaries.push({
    name,
    matched,
    total: readable.length,
    avgMatchedRules: matched ? matchedRules / matched : 0,
    avgNeedsCheck: matched ? needsCheck / matched : 0,
    farMatches,
    allNeedsCheck,
  });

  if (full) {
    console.log(`\n■ ${name}`);
    for (const l of lines) console.log(l);
  }
}

console.log(`\n읽을 수 있는 공고 ${readable.length}건 · 프로필 ${PROFILES.length}개\n`);
console.log(`${pad("프로필", 34)} 일치   규칙평균  확인평균  200km밖   전부확인`);
for (const s of summaries) {
  console.log(
    `${pad(s.name, 34)} ${pad(`${s.matched}/${s.total}`, 6)} ${pad(s.avgMatchedRules.toFixed(1), 9)} ${pad(s.avgNeedsCheck.toFixed(1), 9)} ${pad(String(s.farMatches.length), 9)} ${s.allNeedsCheck}`,
  );
}

const far = summaries.filter((s) => s.farMatches.length > 0);
if (far.length) {
  console.log("\n200km 밖인데 '조건 일치'로 뜨는 공고:");
  for (const s of far) for (const f of s.farMatches) console.log(`  ${pad(s.name, 34)} ${f.id} ${f.km.toFixed(0)}km ${f.title}`);
}

const everything = summaries.filter((s) => s.matched === readable.length);
if (everything.length) {
  console.log("\n모든 공고가 '일치'로 나오는 프로필 (판정이 아니라 통과):");
  for (const s of everything) console.log(`  ${s.name}`);
}

const blind = summaries.filter((s) => s.allNeedsCheck > 0);
if (blind.length) {
  console.log("\n'일치'인데 맞은 규칙이 하나도 없는 경우 (확인 필요만 있음):");
  for (const s of blind) console.log(`  ${pad(s.name, 34)} ${s.allNeedsCheck}건`);
}
