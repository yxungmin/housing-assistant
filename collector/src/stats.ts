/**
 * LH 주택 공고 분포 통계 (LLM 없음, 목록 API만).
 *   npm run lh:stats
 * 지역·유형별 건수와 접수 기간을 세어 "어디까지 추출할 것인가"를 정하는 근거로 쓴다.
 */
import { loadEnv, requireEnv } from "./config";
import { LhClient } from "./lh/api";

const env = loadEnv();
const lh = new LhClient(requireEnv(env, "LH_API_KEY"));

const list = await lh.listAllHousingNotices();
const open = list.filter((n) => n.status_raw !== "접수마감");
const days = 90;

const by = (key: (n: (typeof list)[number]) => string, rows = list) => {
  const m = new Map<string, number>();
  for (const n of rows) m.set(key(n), (m.get(key(n)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`최근 ${days}일 주택 공고 ${list.length}건 (접수 중 ${open.length}건)`);
console.log(`월 환산 ${(list.length / (days / 30)).toFixed(0)}건\n`);

console.log("지역별 (전체):");
for (const [k, v] of by((n) => n.region_name || "?")) console.log(`  ${String(v).padStart(3)}건  ${k}`);

console.log("\n유형별:");
for (const [k, v] of by((n) => n.housing_type)) console.log(`  ${String(v).padStart(3)}건  ${k}`);

const metro = ["서울특별시", "경기도", "인천광역시"];
const metroRows = list.filter((n) => metro.some((m) => (n.region_name ?? "").includes(m.slice(0, 2))));
console.log(`\n수도권(서울·경기·인천): ${metroRows.length}건 = 월 ${(metroRows.length / (days / 30)).toFixed(0)}건`);

const seoul = list.filter((n) => (n.region_name ?? "").includes("서울"));
console.log(`서울만: ${seoul.length}건 = 월 ${(seoul.length / (days / 30)).toFixed(0)}건`);
