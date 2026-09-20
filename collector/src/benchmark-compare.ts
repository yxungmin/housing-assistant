/**
 * 벤치마크 결과 비교. `npm run benchmark`를 모델별로 돌린 뒤 실행한다.
 *   npm run benchmark:compare
 *
 * benchmark/output/report.*.json 을 모아 한 표로 보여 주고, 기준 모델 대비 비용·일치도를 계산한다.
 * 기준이 draft면 여기서 나오는 값은 "정확도"가 아니라 "기준 모델과 얼마나 같은 결과를 내는가"다.
 * 기준 모델 자신의 점수가 재현성(잡음 바닥)이므로, 다른 모델은 그 값과 비교해서 읽어야 한다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fromRoot } from "./paths";

interface Report {
  model: string;
  reference?: string;
  cases: number;
  rule_accuracy: number;
  announcement_exact_rate: number;
  price_accuracy: number;
  missing_rate: number;
  hallucination_rate: number;
  avg_seconds: number;
  avg_cost_usd: number;
  cases_detail: { id: string; gold_rules: number; correct_rules: number; hallucinated_rules: number; gold_prices: number; correct_prices: number; error?: string }[];
}

const OUT = fromRoot("benchmark", "output");
if (!existsSync(OUT)) {
  console.log("benchmark/output 이 없다. 먼저 npm run benchmark 를 돌린다.");
  process.exit(0);
}
const reports = readdirSync(OUT)
  .filter((f) => f.startsWith("report.") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(fromRoot("benchmark", "output", f), "utf8")) as Report);

if (reports.length === 0) {
  console.log("리포트가 없다. npm run benchmark 를 모델별로 돌린다.");
  process.exit(0);
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const krw = (usd: number) => `${Math.round(usd * 1400).toLocaleString("ko-KR")}원`;

console.log(`기준: ${reports[0]!.reference ?? "(미표기)"}\n`);
const rows: Record<string, Record<string, string>> = {};
for (const r of [...reports].sort((a, b) => b.rule_accuracy - a.rule_accuracy)) {
  rows[r.model] = {
    케이스: String(r.cases),
    "조건 일치": pct(r.rule_accuracy),
    "공고 완전일치": pct(r.announcement_exact_rate),
    "가격 일치": pct(r.price_accuracy),
    누락: pct(r.missing_rate),
    "없는 조건 생성": pct(r.hallucination_rate),
    "1건 시간": `${r.avg_seconds.toFixed(0)}s`,
    "1건 비용": krw(r.avg_cost_usd),
  };
}
console.table(rows);

// 월 운영비 환산 (서울·경기 LH+SH 기준, 정정 재추출 15% 포함)
const MONTHLY_NOTICES = 27 * 1.15;
console.log(`\n월 추출비 (서울·경기 LH+SH 약 ${MONTHLY_NOTICES.toFixed(0)}건 기준)`);
for (const r of reports) {
  const monthly = r.avg_cost_usd * MONTHLY_NOTICES;
  console.log(`  ${r.model.padEnd(28)} ${krw(monthly).padStart(12)}   손익분기 ${Math.ceil((monthly * 1400) / 2241)}명`);
}

// 케이스별로 어디서 갈리는지
console.log("\n케이스별 조건 일치");
const ids = [...new Set(reports.flatMap((r) => r.cases_detail.map((c) => c.id)))].sort();
const detail: Record<string, Record<string, string>> = {};
for (const id of ids) {
  detail[id] = {};
  for (const r of reports) {
    const c = r.cases_detail.find((x) => x.id === id);
    detail[id]![r.model.replace("claude-", "").replace("-20251001", "")] = c
      ? c.error
        ? "실패"
        : `${c.correct_rules}/${c.gold_rules} (+${c.hallucinated_rules})`
      : "-";
  }
}
console.table(detail);
