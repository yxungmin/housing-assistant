/**
 * 수집기 본체. GitHub Actions에서 주기적으로 실행.
 *   npm run collect            실제 실행
 *   npm run collect:dry        목록만 읽고 신규 판정까지만 (쓰기·LLM 없음)
 *
 * 흐름: 기관별 목록(LH API, SH 게시판) → 신규·수정 탐지 → 공고문 PDF → Storage → 텍스트 → 섹션
 *       → LLM 추출 → 스키마·자동 검증 → announcement_versions(UNVERIFIED | CONFLICT)
 *       → 게시를 막을 지적이 없으면 자동 게시(auto_publish_version) → 신규면 푸시 대상 조회
 *
 * 비용은 추출한 공고 수에 비례한다. COLLECT_REGIONS로 지역을 좁히면 그만큼 줄어든다 (기본 서울·경기).
 */
import { loadEnv, requireEnv } from "./config";
import { enrichAnnouncement } from "./enrich-announcement";
import { Repo } from "./db/supabase";
import { LhClient, resolveImages } from "./lh/api";
import { extractFromText } from "./llm/extract";
import { extractPdfText, ocrFallback } from "./pdf/extract";
import { buildSections, sectionsToPrompt } from "./pdf/sections";
import { inRegions, lhSource, shSource, type CollectedNotice } from "./sources";
import { ShClient } from "./sh/api";
import { advisoryChecks, autoChecks, blockingChecks } from "./validate/autoChecks";

const env = loadEnv();
// 추출이 꺼져 있으면 목록·신규 판정까지만 한다. 돈도, 쓰기도 없다.
const extractionOff = !env.EXTRACTION_ENABLED;
const dryRun = process.argv.includes("--dry-run") || extractionOff;
const repo = dryRun ? null : new Repo(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), env.PDF_BUCKET);

const regions = env.COLLECT_REGIONS.split(",").map((r) => r.trim()).filter(Boolean);

const providers = env.COLLECT_PROVIDERS.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

if (extractionOff) {
  log("추출이 꺼져 있다 (EXTRACTION_ENABLED=false) — 목록과 신규 판정까지만 하고 LLM·쓰기는 건너뛴다.");
  log("  켜려면 .env 또는 Actions 변수에 EXTRACTION_ENABLED=true. 공고 1건 추출에 약 1,300원이 나간다.");
}

async function processNotice(notice: CollectedNotice): Promise<"new" | "modified" | "skipped" | "conflict"> {
  const existing = repo ? await repo.findByExternalId(notice.provider, notice.external_id) : null;
  // 1차 수정 탐지: 목록 값만 비교. 바뀌지 않았으면 상세 호출 없이 건너뛴다.
  const isNew = !existing;
  if (!isNew && existing.source_modified_at !== null && existing.source_modified_at.startsWith(notice.list_key)) return "skipped";
  log(`${isNew ? "신규" : "수정 의심"} [${notice.provider}] [${notice.housing_type}] ${notice.title}${notice.status_raw ? ` (${notice.status_raw})` : ""}`);
  if (notice.unknown_codes.length) log(`  미지 코드 → 매핑 표 추가 필요: ${notice.unknown_codes.join(", ")}`);
  if (dryRun || !repo) return isNew ? "new" : "modified";

  const detail = await notice.resolve();
  // 2차: 상세까지 반영한 키. 같으면 실제 변경 없음.
  if (!isNew && existing.source_modified_at === detail.modified_key) return "skipped";
  if (detail.correction_reason) log(`  정정 사유: ${detail.correction_reason}`);

  const announcementId = await repo.upsertAnnouncement({
    provider: notice.provider,
    lh_id: notice.external_id,
    title: notice.title,
    housing_type: notice.housing_type,
    region_code: notice.region_code,
    notice_date: notice.notice_date,
    apply_start: detail.apply_start,
    apply_end: detail.apply_end ?? notice.apply_end,
    detail_url: notice.detail_url,
    complex: detail.complex,
    source_modified_at: detail.modified_key,
  });
  const version = (existing?.latest_version ?? 0) + 1;

  const conflict = async (reasons: string[]) => {
    await repo.insertVersion({ announcement_id: announcementId, version, status: "CONFLICT", source_modified_at: detail.modified_key, conflict_reasons: reasons, extraction: null });
    log(`  CONFLICT v${version}: ${reasons.join(" / ")}`);
    return "conflict" as const;
  };

  if (!detail.pdf) return conflict([detail.missing_pdf ?? "공고문 PDF 없음"]);
  const pdfUrl = await repo.uploadPdf(notice.provider, notice.external_id, version, detail.pdf.bytes);

  let text = await extractPdfText(detail.pdf.bytes);
  if (text.needsOcr) {
    const ocr = await ocrFallback(detail.pdf.bytes);
    if (!ocr) return conflict([`스캔 PDF (텍스트 없는 페이지 ${text.emptyPages}/${text.pages.length}) — OCR 미연결`]);
    text = ocr;
  }
  const sections = buildSections(text.pages);
  const prompt = sectionsToPrompt(sections);
  const result = await extractFromText(prompt, { model: env.EXTRACTION_MODEL });
  log(`  LLM ${result.model} in=${result.usage.input_tokens} out=${result.usage.output_tokens} cache=${result.usage.cache_read_input_tokens}`);
  if (!result.output) return conflict([`추출 실패: ${result.error ?? "unknown"}`]);

  // 게시를 막을 지적(숫자를 믿을 수 없음)과 알리기만 할 지적(가격 정보 없음 등)을 나눈다.
  const checked = autoChecks(result.output, { unitPricing: detail.units?.some((u) => u.deposit !== undefined || u.monthly_rent !== undefined) });
  const blocking = blockingChecks(checked);
  const advisory = advisoryChecks(checked);
  const status = blocking.length ? "CONFLICT" : "UNVERIFIED";
  const versionId = await repo.insertVersion({
    announcement_id: announcementId,
    version,
    status,
    source_modified_at: detail.modified_key,
    conflict_reasons: blocking,
    checks: advisory,
    extraction: result.output,
    model: result.model,
    prompt_version: result.prompt_version,
    raw_text_chars: prompt.length,
  });

  // 자동 게시: 사람 승인을 기다리지 않는다. 사람 확인은 나중에 배지(VERIFIED)로만 붙는다.
  if (!blocking.length) {
    await repo.autoPublish(versionId);
    log(`  게시 v${version} (자동 확인)${advisory.length ? ` · 알림 ${advisory.length}건: ${advisory.join(" / ")}` : ""}`);
  }

  /*
   * 원문·그림·집 목록은 **버전마다** 다시 쓴다. 전에는 아래 좌표 블록 안에 있어서
   * (신규 공고 && 카카오 키)일 때만 저장됐다 — 정정공고(v2)가 와도 pdf_url이 v1 공고문을 가리켰고,
   * 카카오 키가 없는 실행에서는 공고문 링크가 아예 저장되지 않았다 (2026-09-24 감사).
   */
  const images = detail.images?.length ? await resolveImages(detail.images) : [];
  if (images.length) log(`  공고 그림 ${images.length}장: ${[...new Set(images.map((i) => i.kind))].join(", ")}`);
  await repo.upsertAnnouncement({
    provider: notice.provider,
    lh_id: notice.external_id,
    title: notice.title,
    housing_type: notice.housing_type,
    region_code: notice.region_code,
    notice_date: result.output.schedule.notice_date ?? notice.notice_date,
    apply_start: detail.apply_start ?? result.output.schedule.apply_start,
    apply_end: detail.apply_end ?? result.output.schedule.apply_end ?? notice.apply_end,
    pdf_url: pdfUrl,
    detail_url: notice.detail_url,
    // 기관이 준 그림. 주소를 한 번 펼쳐야 그림 파일이 나온다 (lh/api.ts resolveImages).
    images: images.length ? images : undefined,
    // 흩어진 집 목록. 좌표는 아직 없다 — 주소마다 한 번 찍는 일은 enrich가 한다.
    units: detail.units,
    source_modified_at: detail.modified_key,
  });

  // 좌표·시세·대기·관리비·통근은 신규 공고에서 1회. 번들 스크립트(enrich.ts)와 같은 함수다 (enrich-announcement.ts).
  const address = result.output.address ?? detail.address;
  if (isNew && address) {
    const patch = await enrichAnnouncement(
      { label: notice.title, title: notice.title, region_code: notice.region_code, address, complex: detail.complex, households: detail.households, extraction: result.output },
      { env, regions, log },
    );
    // b_code는 시세·관리비의 시군구를 자르는 데만 쓴다. DB 컬럼이 아니다
    const { b_code: _bCode, ...cols } = patch;
    await repo.upsertAnnouncement({ provider: notice.provider, lh_id: notice.external_id, title: notice.title, housing_type: notice.housing_type, region_code: notice.region_code, ...cols });
  }
  log(`  v${version} ${status}${blocking.length ? `: ${blocking.join(" / ")}` : ""}`);
  if (isNew) {
    const tokens = await repo.pushTargets(notice.region_code, notice.housing_type);
    log(`  푸시 대상 ${tokens.length}명 (발송은 검수 VERIFIED 후 — TODO M7)`);
  }
  return isNew ? "new" : "modified";
}

const sources = [];
if (providers.includes("LH")) sources.push(lhSource(new LhClient(requireEnv(env, "LH_API_KEY"))));
if (providers.includes("SH")) sources.push(shSource(new ShClient()));
if (sources.length === 0) throw new Error(`COLLECT_PROVIDERS에 수집할 기관이 없다: "${env.COLLECT_PROVIDERS}"`);

const collected: CollectedNotice[] = [];
for (const source of sources) {
  try {
    const rows = await source.list();
    const kept = rows.filter((n) => inRegions(n, regions));
    log(`${source.provider} 공고 ${rows.length}건 중 대상 ${kept.length}건`);
    collected.push(...kept);
  } catch (err) {
    // 한 기관이 막혀도 나머지는 수집한다. SH는 게시판 파싱이라 구조가 바뀌면 여기로 떨어진다.
    log(`${source.provider} 목록 실패: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

collected.sort((a, b) => (b.notice_date ?? "").localeCompare(a.notice_date ?? ""));
log(`수집 대상 ${collected.length}건 (기관 ${providers.join("·")}, 지역 ${regions.length ? regions.join("·") : "전체"})${dryRun ? " (dry-run)" : ""}`);

const counts = { new: 0, modified: 0, skipped: 0, conflict: 0, failed: 0 };
let processed = 0;
for (const notice of collected) {
  if (processed >= env.MAX_ANNOUNCEMENTS_PER_RUN) break;
  try {
    const r = await processNotice(notice);
    counts[r]++;
    if (r !== "skipped") processed++;
  } catch (err) {
    counts.failed++;
    log(`  실패 ${notice.provider}/${notice.external_id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
log(`완료: ${JSON.stringify(counts)}`);
if (counts.failed > 0) process.exitCode = 1;
