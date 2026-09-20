/**
 * 벤치마크·앱 로컬 데이터용 공고문 PDF 수집 (LLM 없음, LH API만).
 *   npm run benchmark:fetch                 접수 중인 임대 공고 10건 추가
 *   npm run benchmark:fetch -- --count 20   건수 지정
 *   npm run benchmark:fetch -- --all-types  분양·신혼희망타운 포함
 *
 * benchmark/pdfs/NNN.pdf 로 저장하고 benchmark/pdfs/meta.json 에 LH 목록·상세의 메타(공고 id, 지역, 일정, 주소)를 남긴다.
 * app-data.ts 가 이 메타로 앱 데이터의 지역·접수일·주소를 채운다. 이미 받은 공고(lh_id)는 건너뛴다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, requireEnv } from "./config";
import { LhClient, parseNoticeDetail, pickNoticePdf } from "./lh/api";
import { fromRoot } from "./paths";

export interface PdfMeta {
  id: string;
  lh_id: string;
  title: string;
  housing_type: string;
  region_code: string;
  region_name: string;
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  complex_name?: string;
  households?: number;
  fetched_at: string;
}

const PDFS = fromRoot("benchmark", "pdfs");
const META_PATH = join(PDFS, "meta.json");
mkdirSync(PDFS, { recursive: true });

const args = process.argv.slice(2);
const countIdx = args.indexOf("--count");
const count = countIdx >= 0 ? Number(args[countIdx + 1]) : 10;
const allTypes = args.includes("--all-types");

const env = loadEnv();
const lh = new LhClient(requireEnv(env, "LH_API_KEY"));
const meta: PdfMeta[] = existsSync(META_PATH) ? (JSON.parse(readFileSync(META_PATH, "utf8")) as PdfMeta[]) : [];
const have = new Set(meta.map((m) => m.lh_id));
let next = Math.max(0, ...readdirSync(PDFS).map((f) => Number(f.match(/^(\d{3})\.pdf$/)?.[1] ?? 0))) + 1;

const list = (await lh.listAllHousingNotices())
  .filter((n) => n.status_raw !== "접수마감" && !have.has(n.lh_id))
  .filter((n) => allTypes || (n.housing_type !== "public_sale" && n.housing_type !== "newlywed_hope"))
  .sort((a, b) => (b.notice_date ?? "").localeCompare(a.notice_date ?? ""));
console.log(`후보 ${list.length}건, ${count}건 받는다`);

let added = 0;
for (const n of list) {
  if (added >= count) break;
  try {
    const detail = parseNoticeDetail(await lh.getNoticeDetail(n));
    const pdf = pickNoticePdf(detail.attachments);
    if (!pdf) {
      console.log(`  건너뜀 (PDF 없음): ${n.title}`);
      continue;
    }
    const bytes = await lh.downloadPdf(pdf.url);
    const id = String(next).padStart(3, "0");
    writeFileSync(join(PDFS, `${id}.pdf`), bytes);
    meta.push({
      id,
      lh_id: n.lh_id,
      title: n.title,
      housing_type: n.housing_type,
      region_code: n.region_code,
      region_name: n.region_name,
      notice_date: n.notice_date,
      apply_start: detail.apply_start,
      apply_end: detail.apply_end ?? n.apply_end,
      address: detail.address,
      complex_name: detail.complex_name,
      households: detail.households,
      fetched_at: new Date().toISOString(),
    });
    writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
    console.log(`  ${id}.pdf  [${n.housing_type}] ${n.title} (${(bytes.length / 1024).toFixed(0)} KB, ${n.region_name}, 마감 ${detail.apply_end ?? n.apply_end ?? "?"})`);
    next++;
    added++;
  } catch (err) {
    console.log(`  실패 ${n.lh_id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`완료: ${added}건 추가, 총 ${meta.length}건 메타`);
