/**
 * 벤치마크 018 초안·PDF를 다시 만든다.
 *
 * `benchmark/output/`과 `benchmark/pdfs/`는 git 제외다. 그래서 클론을 새로 하거나
 * 작업 폴더를 지우면 검수 작업이 통째로 사라진다 — 2026-09-21에 실제로 그렇게 잃었고,
 * TODO에 "막힘"으로 남아 있었다.
 *
 * 다시 만드는 데 LLM은 필요 없다. 초안은 이미 앱 번들에 실려 있고(그게 서버에 게시된
 * 추출 결과다), PDF는 SH에서 다시 받으면 된다. 둘 다 공짜다.
 *
 *   npm run benchmark:restore
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ShClient, pickNoticePdf } from "./sh/api";
import { fromRoot } from "./paths";

/** 벤치마크 id → 번들에서 찾을 공고. 늘어나면 여기에 한 줄 더한다. */
const CASES = [{ id: "018", lhId: "309467", note: "SH 제51차 장기전세" }];

const BUNDLE = fromRoot("apps", "mobile", "data", "announcements.json");
const OUT = fromRoot("benchmark", "output");
const PDFS = fromRoot("benchmark", "pdfs");

interface BundleItem {
  lh_id?: string;
  title?: string;
  extraction?: unknown;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(PDFS, { recursive: true });

  const raw = JSON.parse(readFileSync(BUNDLE, "utf8")) as BundleItem[] | { announcements?: BundleItem[] };
  const items = Array.isArray(raw) ? raw : (raw.announcements ?? []);
  const sh = new ShClient();
  let failed = 0;

  for (const c of CASES) {
    const item = items.find((a) => a.lh_id === c.lhId);
    if (!item?.extraction) {
      console.error(`✗ ${c.id}: 번들에 ${c.lhId}의 추출 결과가 없다 (${c.note})`);
      failed++;
      continue;
    }
    const draft = join(OUT, `${c.id}.draft.json`);
    writeFileSync(
      draft,
      JSON.stringify({ id: c.id, pdf: `${c.id}.pdf`, source: "bundle:apps/mobile/data/announcements.json", gold: item.extraction }, null, 1),
    );
    console.log(`✓ ${c.id} 초안 — ${item.title?.slice(0, 40) ?? ""}`);

    const pdf = join(PDFS, `${c.id}.pdf`);
    if (existsSync(pdf)) {
      console.log(`  PDF 이미 있음`);
      continue;
    }
    try {
      const detail = await sh.getNoticeDetail(c.lhId);
      const att = pickNoticePdf(detail.attachments);
      if (!att) throw new Error("공고문 PDF를 고르지 못했다");
      const bytes = await sh.downloadPdf(att);
      writeFileSync(pdf, bytes);
      console.log(`  PDF ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
    } catch (e) {
      console.error(`  ✗ PDF 실패: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(failed === 0 ? "\n복구 완료. npm run fixture:check -- 018" : `\n${failed}건 실패`);
  if (failed > 0) process.exitCode = 1;
}

await main();
