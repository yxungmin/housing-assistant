/**
 * 앱 번들 데이터를 Supabase로 올린다. `npm run bundle:push`
 *
 * 왜 필요한가 — 앱은 번들(`apps/mobile/data/announcements.json`)보다 서버를 우선한다.
 * 그래서 Supabase를 붙이는 순간 번들 12건이 서버 내용으로 **교체**된다.
 * 수집기가 한 번도 실제로 돌지 않아 서버가 비어 있으면, 앱에는 테스트 공고만 남는다.
 *
 * 번들에는 이미 추출 결과(extraction)가 들어 있다. 그걸 그대로 올리면 되므로
 * **LLM을 다시 돌릴 이유가 없다 — 추출 비용이 0이다.**
 * 공고문 PDF도 `pdf:rehost`로 우리 Storage에 옮겨 둬서 주소가 이미 맞다.
 *
 * 추출 결과가 비어 있는 항목(조건을 못 읽은 "분석 중" 공고)은 공고 행만 만들고
 * 버전을 만들지 않는다. 그러면 뷰가 UNVERIFIED로 내려 주고 앱이 "조건 분석 중"으로 보여 준다.
 *
 *   npm run bundle:push            # 무엇을 올릴지 보여 주기만 한다
 *   npm run bundle:push -- --apply # 실제로 올린다
 */
import { readFileSync } from "node:fs";
import { ExtractionOutput, inflateUnits, type HousingType, type SupplyUnit, type UnitPlaces } from "@housing/schema";
import { loadEnv, requireEnv } from "./config";
import { Repo } from "./db/supabase";
import { fromRoot } from "./paths";

const env = loadEnv();
const apply = process.argv.includes("--apply");
const repo = new Repo(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), env.PDF_BUCKET);

interface BundleItem {
  id: string;
  lh_id: string;
  provider?: "LH" | "SH";
  title: string;
  housing_type: HousingType;
  region_code: string;
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  pdf_url?: string;
  detail_url?: string;
  lat?: number;
  lng?: number;
  b_code?: string;
  transit?: Record<string, unknown>;
  nearby?: Record<string, unknown>[];
  images?: object[];
  units?: SupplyUnit[];
  unit_places?: UnitPlaces;
  market?: object;
  waiting?: object;
  commute?: object;
  maintenance?: object;
  checks?: string[];
  extraction: unknown;
}

/** 조건을 하나라도 읽어 낸 추출인가. 빈 껍데기는 버전으로 만들지 않는다. */
const hasContent = (e: unknown): boolean => {
  const parsed = ExtractionOutput.safeParse(e);
  if (!parsed.success) return false;
  return parsed.data.tracks.some((t) => t.rules.length > 0 || t.pricing.length > 0);
};

async function main(): Promise<void> {
  const items = JSON.parse(readFileSync(fromRoot("apps", "mobile", "data", "announcements.json"), "utf8")) as BundleItem[];
  console.log(`번들 ${items.length}건${apply ? "" : " (미리보기 — 실제로 올리려면 --apply)"}\n`);

  let pushed = 0;
  let pending = 0;
  let failed = 0;

  for (const it of items) {
    const provider = it.provider ?? "LH";
    const withContent = hasContent(it.extraction);
    const label = `${provider} ${it.lh_id} · ${it.title.slice(0, 32)}`;

    if (!apply) {
      console.log(`  - ${label}${withContent ? "" : "  (조건 없음 → 분석 중으로)"}`);
      continue;
    }

    try {
      const announcementId = await repo.upsertAnnouncement({
        provider,
        lh_id: it.lh_id,
        title: it.title,
        housing_type: it.housing_type,
        region_code: it.region_code,
        notice_date: it.notice_date,
        apply_start: it.apply_start,
        apply_end: it.apply_end,
        pdf_url: it.pdf_url,
        detail_url: it.detail_url,
        images: it.images,
        // 번들은 집 좌표를 주소별로 접어 두지만 DB는 펼친 채다 — Edge Function transit이 unit.lat을 읽는다
        units: it.units ? inflateUnits(it.units, it.unit_places) : undefined,
        lat: it.lat,
        lng: it.lng,
        transit: it.transit,
        market: it.market,
        waiting: it.waiting,
        commute: it.commute,
        maintenance: it.maintenance,
        nearby: it.nearby,
      });

      if (!withContent) {
        console.log(`  · ${label}  (조건 없음 — 공고만 올림)`);
        pending++;
        continue;
      }

      const parsed = ExtractionOutput.parse(it.extraction);
      const versionId = await repo.insertVersion({
        announcement_id: announcementId,
        version: 1,
        status: "UNVERIFIED",
        conflict_reasons: [],
        checks: it.checks ?? [],
        extraction: parsed,
        // 사람이 새로 돌린 추출이 아니라 번들에 있던 것을 옮긴 것이다. 그 사실을 남긴다.
        prompt_version: "bundle-import",
      });
      await repo.autoPublish(versionId);
      console.log(`  ✓ ${label}`);
      pushed++;
    } catch (e) {
      // Supabase 오류는 Error가 아니라 {message, details, hint, code} 객체다. String()으로는 안 보인다.
      const detail = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(`  ✗ ${label}: ${detail}`);
      failed++;
    }
  }

  if (apply) console.log(`\n게시 ${pushed}건 · 분석 중 ${pending}건 · 실패 ${failed}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
