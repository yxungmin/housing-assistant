/**
 * 벤치마크·앱 로컬 데이터용 공고문 PDF 수집 (LLM 없음, Supabase 없음).
 *   npm run benchmark:fetch                        기본 기관·지역으로 10건
 *   npm run benchmark:fetch -- --count 20          건수 지정
 *   npm run benchmark:fetch -- --provider SH       기관 지정 (LH, SH)
 *   npm run benchmark:fetch -- --regions 11        지역 지정 (빈 값이면 전국)
 *
 * benchmark/pdfs/NNN.pdf 로 저장하고 benchmark/pdfs/meta.json 에 공고 메타를 남긴다.
 * app-data.ts가 이 메타로 앱 데이터의 기관·지역·일정·주소를 채운다. 이미 받은 공고는 건너뛴다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, requireEnv } from "./config";
import type { Provider } from "./db/supabase";
import { LhClient } from "./lh/api";
import { ShClient } from "./sh/api";
import { inRegions, lhSource, shSource, type Source } from "./sources";
import { fromRoot } from "./paths";

export interface PdfMeta {
  id: string;
  provider: Provider;
  lh_id: string;
  title: string;
  housing_type: string;
  region_code: string;
  region_name: string;
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  pdf_name?: string;
  /** 기관 사이트의 원문 공고문 주소. 앱이 "공고문 12쪽"을 실제로 열 수 있게 한다. */
  pdf_url?: string;
  fetched_at: string;
}

const PDFS = fromRoot("benchmark", "pdfs");
const META_PATH = join(PDFS, "meta.json");
mkdirSync(PDFS, { recursive: true });

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const count = Number(arg("count") ?? 10);
const env = loadEnv();
const providers = (arg("provider") ?? env.COLLECT_PROVIDERS).split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);
const regions = (arg("regions") ?? env.COLLECT_REGIONS).split(",").map((r) => r.trim()).filter(Boolean);

const meta: PdfMeta[] = existsSync(META_PATH) ? (JSON.parse(readFileSync(META_PATH, "utf8")) as PdfMeta[]) : [];
const have = new Set(meta.map((m) => `${m.provider}/${m.lh_id}`));
let next = Math.max(0, ...readdirSync(PDFS).map((f) => Number(f.match(/^(\d{3})\.pdf$/)?.[1] ?? 0))) + 1;

const sources: Source[] = [];
if (providers.includes("LH")) sources.push(lhSource(new LhClient(requireEnv(env, "LH_API_KEY"))));
if (providers.includes("SH")) sources.push(shSource(new ShClient()));

const candidates = [];
for (const source of sources) {
  try {
    const rows = (await source.list()).filter((n) => inRegions(n, regions) && !have.has(`${n.provider}/${n.external_id}`));
    console.log(`${source.provider}: 후보 ${rows.length}건`);
    candidates.push(...rows);
  } catch (err) {
    console.log(`${source.provider} 목록 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}
candidates.sort((a, b) => (b.notice_date ?? "").localeCompare(a.notice_date ?? ""));
console.log(`합계 ${candidates.length}건 중 ${count}건 받는다 (지역 ${regions.length ? regions.join("·") : "전체"})`);

let added = 0;
for (const n of candidates) {
  if (added >= count) break;
  try {
    const detail = await n.resolve();
    if (!detail.pdf) {
      console.log(`  건너뜀 [${n.provider}] ${n.title}: ${detail.missing_pdf}`);
      continue;
    }
    const id = String(next).padStart(3, "0");
    writeFileSync(join(PDFS, `${id}.pdf`), detail.pdf.bytes);
    meta.push({
      id,
      provider: n.provider,
      lh_id: n.external_id,
      title: n.title,
      housing_type: n.housing_type,
      region_code: n.region_code,
      region_name: n.region_code === "11" ? "서울특별시" : n.region_code,
      notice_date: n.notice_date,
      apply_start: detail.apply_start,
      apply_end: detail.apply_end ?? n.apply_end,
      address: detail.address,
      pdf_name: detail.pdf.name,
      pdf_url: detail.pdf.url,
      fetched_at: new Date().toISOString(),
    });
    writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
    console.log(`  ${id}.pdf  [${n.provider}][${n.housing_type}] ${n.title} (${(detail.pdf.bytes.length / 1024).toFixed(0)} KB, 마감 ${detail.apply_end ?? n.apply_end ?? "?"})`);
    next++;
    added++;
  } catch (err) {
    console.log(`  실패 [${n.provider}] ${n.external_id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`완료: ${added}건 추가, 총 ${meta.length}건 메타`);
