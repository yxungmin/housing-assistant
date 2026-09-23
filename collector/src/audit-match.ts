/**
 * 추천 감사 — 프로필 수천 개 × 모든 공고로 "추천된 공급이 정말 그 사람 것인가"를 본다.
 *   npm run audit:match              요약 (공급 유형별 오추천 수)
 *   npm run audit:match -- --examples 오추천마다 예시 프로필
 *
 * simulate.ts가 "흔한 사람 10명"을 본다면 이건 조합 전부를 본다. LLM 없음.
 *
 * 판정을 엔진에 맡기면 엔진이 틀린 것을 못 잡는다. 그래서 **공급 유형 이름**으로 따로 판정한다.
 * "대학생 계층"이면 대학생이어야 하고, "고령자"면 65세 이상, "철거민"이면 우리 입력으로는
 * 누구도 대상이라고 말할 수 없다. 이름은 기관이 붙인 것이라 추출 실수와 독립적이다.
 * 이름이 말하지 않는 조건(소득 상한 숫자 등)은 여기서 보지 않는다 — 그건 엔진 테스트의 몫이다.
 *
 * "추천"은 홈이 "조건에 맞는 공고"로 세는 것 — is_match이고, 그 근거가 된 후보 트랙들이다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { matchAnnouncement, type TrackResult } from "@housing/engine";
import type { SpecialStatus, UserProfile } from "@housing/schema";
import { fromRoot } from "./paths";

interface Row {
  id: string;
  title: string;
  region_code: string;
  status?: string;
  extraction: { tracks: TrackResult["track"][] };
}

// ── 데이터: 번들 + 번들에 없는 초안(연습용 001~004도 매칭 검사용으로는 유효한 추출이다)
const bundle = JSON.parse(readFileSync(fromRoot("apps", "mobile", "data", "announcements.json"), "utf8")) as Row[];
const rows: Row[] = bundle.filter((r) => r.status !== "UNVERIFIED");
const DRAFT_REGION: Record<string, string> = { "001": "41", "002": "11", "003": "11", "004": "11" };
const outDir = fromRoot("benchmark", "output");
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir).filter((x) => x.endsWith(".draft.json"))) {
    const id = f.slice(0, 3);
    if (rows.some((r) => r.id === id) || !DRAFT_REGION[id]) continue;
    const d = JSON.parse(readFileSync(`${outDir}/${f}`, "utf8"));
    const ex = d.gold ?? d;
    rows.push({ id, title: ex.title, region_code: DRAFT_REGION[id]!, extraction: ex });
  }
}

// ── 프로필: 생애 단계 × 소득 × 자산 × 무주택 × 지역 × 계층 입력 방식 × 차
interface Persona {
  key: string;
  age: number;
  marriage: UserProfile["marriage"];
  marriage_years?: number;
  children_ages: number[];
  statuses: SpecialStatus[];
}
const PERSONAS: Persona[] = [
  { key: "22 대학생", age: 22, marriage: "single", children_ages: [], statuses: ["student"] },
  { key: "27 직장인", age: 27, marriage: "single", children_ages: [], statuses: ["new_worker"] },
  { key: "31 예비신혼", age: 31, marriage: "pre_marriage", children_ages: [], statuses: [] },
  { key: "29 신혼 신생아", age: 29, marriage: "married", marriage_years: 1, children_ages: [0], statuses: [] },
  { key: "34 신혼 자녀1", age: 34, marriage: "married", marriage_years: 3, children_ages: [2], statuses: [] },
  { key: "38 기혼9년 자녀2", age: 38, marriage: "married", marriage_years: 9, children_ages: [5, 9], statuses: [] },
  { key: "38 한부모", age: 38, marriage: "single_parent", children_ages: [6], statuses: ["single_parent_support"] },
  { key: "45 1인", age: 45, marriage: "single", children_ages: [], statuses: [] },
  { key: "68 고령 1인", age: 68, marriage: "single", children_ages: [], statuses: [] },
  { key: "70 수급자", age: 70, marriage: "single", children_ages: [], statuses: ["basic_livelihood"] },
  { key: "40 장애인", age: 40, marriage: "single", children_ages: [], statuses: ["disabled"] },
  { key: "55 국가유공자", age: 55, marriage: "married", marriage_years: 25, children_ages: [], statuses: ["national_merit"] },
];
const INCOMES = [0, 1_500_000, 3_000_000, 5_000_000, 9_000_000];
const ASSETS = [20_000_000, 150_000_000, 500_000_000];
const HOMELESS = [true, false];
const REGIONS = ["11", "41", "45"];
/** 계층을 어떻게 입력했나: 페르소나대로 / 입력 안 함(온보딩 기본값) / "해당 없음" */
const STATUS_MODES = ["as-persona", "unset", "none"] as const;
const CARS = [0, 40_000_000];

const TODAY = new Date(2026, 8, 23);
const birth = (age: number) => `${TODAY.getFullYear() - age}-01-15`;

function makeProfile(p: Persona, income: number, asset: number, homeless: boolean, region: string, mode: (typeof STATUS_MODES)[number], car: number): UserProfile {
  const kids = p.children_ages.length;
  const spouse = p.marriage === "married" || p.marriage === "pre_marriage" ? 1 : 0;
  return {
    region_code: region,
    birth_date: birth(p.age),
    age: p.age,
    marriage: p.marriage,
    marriage_years: p.marriage_years,
    household_size: 1 + spouse + kids,
    children_count: kids,
    children_ages: p.children_ages,
    income_type: spouse && income >= 5_000_000 ? "dual" : "single",
    annual_income: income * 12,
    monthly_income: income,
    total_assets: asset,
    car_value: car,
    monthly_debt_payment: 0,
    is_homeless: homeless,
    homeless_months: homeless ? Math.max(0, (p.age - 30) * 12) : undefined,
    statuses: mode === "as-persona" ? p.statuses : mode === "none" ? [] : undefined,
    subscription_months: 24,
    subscription_deposits: 24,
    subscription_active: true,
  } as UserProfile;
}

// ── 이름으로 판정 (엔진과 독립)
const has = (pr: UserProfile, ...s: SpecialStatus[]) => (pr.statuses ?? []).some((x) => s.includes(x));
// 신혼부부 계층은 대개 "혼인 7년 이내 또는 6세 이하 자녀가 있는 혼인 가구"다 (행복주택·국민임대)
const newlywed = (pr: UserProfile) =>
  (pr.marriage === "married" && ((pr.marriage_years ?? 99) <= 7 || !!pr.children_ages?.some((a) => a <= 6))) || pr.marriage === "pre_marriage";
const singleParent = (pr: UserProfile) => pr.marriage === "single_parent" || has(pr, "single_parent_support");
const age = (pr: UserProfile) => pr.age ?? 0;

/** 이 트랙 이름이 요구하는 대상이 아닌 이유. 대상이면 null */
function nameOracle(title: string, trackName: string, pr: UserProfile): string | null {
  const n = trackName;
  if (/철거민|이주대책|제대군인|비닐간이|공작물|재해|사업지구|이주자/.test(n)) return "우리 입력으로는 알 수 없는 대상(철거민 등)";
  if (/대학생/.test(n) && !/청년/.test(n.replace(/대학생계층·청/, "")) && !has(pr, "student", "job_seeker")) return "대학생·취준생이 아님";
  if (/청년/.test(n) && !/대학생/.test(n) && (age(pr) < 19 || age(pr) > 39)) return "청년 나이(19~39) 밖";
  if (/고령자/.test(n) && !/주거약자/.test(n) && age(pr) < 65) return "65세 미만";
  if (/신생아/.test(n) && !pr.children_ages?.some((a) => a <= 1) && !singleParent(pr)) return "신생아 가구가 아님";
  if (/신혼/.test(n) && /한부모/.test(n)) {
    if (!newlywed(pr) && !singleParent(pr) && !/혼인가구/.test(n)) return "신혼부부·한부모가 아님";
  } else if (/신혼|예비신혼/.test(n) && !newlywed(pr)) return "신혼부부가 아님";
  else if (/한부모/.test(n) && !/수급자/.test(n) && !singleParent(pr)) return "한부모가 아님";
  if (/혼인가구/.test(n) && !(pr.marriage === "married" && pr.children_ages?.some((a) => a <= 6))) return "6세 이하 자녀가 있는 혼인가구가 아님";
  if (/주거급여/.test(n) && !has(pr, "welfare_recipient")) return "주거급여 수급자가 아님";
  if (/수급자/.test(n) && !/주거급여/.test(n) && !has(pr, "basic_livelihood", "welfare_recipient", "single_parent_support")) return "수급자·한부모가 아님";
  if (/주거약자/.test(n) && age(pr) < 65 && !has(pr, "disabled", "national_merit")) return "주거약자(고령자·장애인·유공자)가 아님";
  if (/창작자|예술인/.test(n) && !has(pr, "creator", "artist")) return "창작자·예술인이 아님";
  if (/영구임대/.test(title) && !/완화/.test(title + n) && /1순위/.test(n) && !has(pr, "basic_livelihood", "national_merit", "single_parent_support", "nk_defector", "disabled", "elderly_care", "care_leaver"))
    return "영구임대 1순위 대상 계층이 아님";
  return null;
}

/**
 * 이름이 이 사람을 **겨냥한** 공급인가 (놓친 추천을 찾는 쪽). 이름에 대상이 없으면(일반공급) null — 판단하지 않는다.
 */
function nameTargets(title: string, trackName: string, pr: UserProfile): boolean | null {
  const n = trackName;
  // 청년 공고(청년매입임대 등)는 미혼 청년만 받는다. 순위 이름에 "한부모"가 있어도 청년이 아니면 대상이 아니다
  if (/청년/.test(title) && !/대학생/.test(title) && pr.marriage !== "single") return false;
  const hits: boolean[] = [];
  if (/대학생/.test(n)) hits.push(has(pr, "student", "job_seeker"));
  if (/청년/.test(n)) hits.push(age(pr) >= 19 && age(pr) <= 39 && pr.marriage === "single");
  if (/고령자/.test(n)) hits.push(age(pr) >= 65);
  if (/신혼|예비신혼/.test(n)) hits.push(newlywed(pr));
  if (/한부모/.test(n)) hits.push(singleParent(pr));
  if (/주거급여/.test(n)) hits.push(has(pr, "welfare_recipient"));
  if (/주거약자/.test(n)) hits.push(age(pr) >= 65 || has(pr, "disabled", "national_merit"));
  if (hits.length === 0) return null;
  return hits.some(Boolean);
}

/** 이름과 무관하게 지켜야 할 것 */
function generalOracle(row: Row, pr: UserProfile): string | null {
  if (pr.is_homeless === false) return "유주택자에게 임대 추천";
  const metro = ["11", "28", "41"];
  if (pr.region_code === "45" && metro.includes(row.region_code)) return "전북 거주자에게 수도권 공고";
  return null;
}

// 엔진의 후보 기준을 그대로 옮긴다 (match.ts matchAnnouncement)
const isCandidate = (t: TrackResult) =>
  t.summary.mismatched === 0 && !t.region_guarded && !t.status_guarded && !t.groups.some((g) => g.contradicted);

// ── 실행
const examples = process.argv.includes("--examples");
type Hit = { count: number; example?: string };
const byTrack = new Map<string, Hit>();
const byGeneral = new Map<string, Hit>();
const missed = new Map<string, Hit>();
let profiles = 0;
let recs = 0;
let bad = 0;
const perPersona = new Map<string, { recs: number; bad: number }>();

for (const p of PERSONAS)
  for (const income of INCOMES)
    for (const asset of ASSETS)
      for (const homeless of HOMELESS)
        for (const region of REGIONS)
          for (const mode of STATUS_MODES)
            for (const car of CARS) {
              const pr = makeProfile(p, income, asset, homeless, region, mode, car);
              profiles++;
              const label = `${p.key} · 월${income / 10_000}만 · 자산${asset / 1e8}억 · ${homeless ? "무주택" : "유주택"} · ${region} · 계층:${mode} · 차${car / 1e4}만`;
              const clearlyEligible = income <= 1_500_000 && asset <= 20_000_000 && homeless && car === 0 && mode === "as-persona";
              for (const row of rows) {
                const m = matchAnnouncement(row.extraction as never, pr, { announcement_region: row.region_code, announcement_title: row.title });
                if (clearlyEligible && region === row.region_code && !m.is_match) {
                  const aimed = m.tracks.find((t) => nameTargets(row.title, t.track.name, pr) === true && nameOracle(row.title, t.track.name, pr) === null);
                  if (aimed) {
                    const why = aimed.groups.flatMap((g) => g.rules).find((r) => r.status === "MISMATCH")
                      ?? aimed.groups.flatMap((g) => g.rules).find((r) => r.status === "NEEDS_CHECK");
                    const k = `${row.id} ${row.title.slice(0, 22)} | ${aimed.track.name.slice(0, 26)} | ${p.key} | ${why ? `${why.rule.category} ${why.status}: ${why.rule.source.text.slice(0, 40)}` : aimed.status_guarded ? "계층 미확인" : "?"}`;
                    const h = missed.get(k) ?? { count: 0 };
                    h.count++;
                    h.example ??= label;
                    missed.set(k, h);
                  }
                }
                if (!m.is_match) continue;
                recs++;
                const stat = perPersona.get(p.key) ?? { recs: 0, bad: 0 };
                stat.recs++;
                let wrong = false;
                const g = generalOracle(row, pr);
                if (g) {
                  wrong = true;
                  const k = `${g}`;
                  const h = byGeneral.get(k) ?? { count: 0 };
                  h.count++;
                  h.example ??= `${row.id} ${row.title.slice(0, 20)} ← ${label}`;
                  byGeneral.set(k, h);
                }
                // 후보 트랙이 하나라도 맞으면 그 공고의 추천은 정당하다. 전부 이름과 어긋날 때만 오추천이다.
                const cands = m.tracks.filter(isCandidate);
                const reasons = cands.map((t) => nameOracle(row.title, t.track.name, pr));
                if (cands.length && reasons.every((r) => r !== null)) {
                  wrong = true;
                  const t = cands[0]!;
                  const k = `${row.id} ${row.title.slice(0, 22)} | ${t.track.name.slice(0, 26)} | ${reasons[0]}`;
                  const h = byTrack.get(k) ?? { count: 0 };
                  h.count++;
                  h.example ??= label;
                  byTrack.set(k, h);
                }
                if (wrong) {
                  bad++;
                  stat.bad++;
                }
                perPersona.set(p.key, stat);
              }
            }

console.log(`\n공고 ${rows.length}건 × 프로필 ${profiles.toLocaleString()}개 = ${(rows.length * profiles).toLocaleString()}회 판정`);
console.log(`추천(조건에 맞는 공고) ${recs.toLocaleString()}회 중 오추천 ${bad.toLocaleString()}회 (${recs ? ((bad / recs) * 100).toFixed(1) : 0}%)\n`);

console.log("페르소나              추천    오추천");
for (const [k, v] of perPersona) console.log(`${k.padEnd(18)} ${String(v.recs).padStart(6)}  ${String(v.bad).padStart(6)}`);

const print = (title: string, map: Map<string, Hit>) => {
  if (map.size === 0) return console.log(`\n${title}: 없음`);
  console.log(`\n${title}`);
  for (const [k, v] of [...map].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(v.count).padStart(6)}  ${k}`);
    if (examples && v.example) console.log(`          예: ${v.example}`);
  }
};
print("공급 유형 이름과 어긋난 추천 (후보 트랙 전부가 대상 아님)", byTrack);
print("일반 규칙 위반", byGeneral);
print("놓친 추천 (확실히 자격이 되는 사람에게 그 사람을 겨냥한 공급이 안 나감)", missed);
if (bad > 0) process.exitCode = 1;

// ── 한눈에: 소득·자산이 낮은 무주택자(월 150만 원 · 자산 2천만 원 · 차 없음 · 계층 입력함)에게 무엇이 나가나
if (process.argv.includes("--matrix")) {
  console.log("\n추천 표 (월 150만 원 · 자산 2천만 원 · 무주택 · 차 없음 · 계층 입력함, 공고 지역에 산다고 둔다)");
  console.log("✓ 추천  △ 대상 계층 확인  · 추천 안 함\n");
  const cols = rows.map((r) => r.id);
  console.log(`${"".padEnd(18)} ${cols.map((c) => c.padStart(4)).join("")}`);
  for (const p of PERSONAS) {
    const cells = rows.map((row) => {
      const pr = makeProfile(p, 1_500_000, 20_000_000, true, row.region_code, "as-persona", 0);
      const m = matchAnnouncement(row.extraction as never, pr, { announcement_region: row.region_code, announcement_title: row.title });
      return (m.is_match ? "✓" : m.status_uncertain ? "△" : "·").padStart(4);
    });
    console.log(`${p.key.padEnd(18)} ${cells.join("")}`);
  }
  console.log("");
  for (const r of rows) console.log(`  ${r.id} ${r.title.slice(0, 44)}`);
}
