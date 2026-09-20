/**
 * 수집기 본체. GitHub Actions에서 30분마다 실행.
 *   npm run collect            실제 실행
 *   npm run collect:dry        API 목록만 읽고 신규 판정까지만 (쓰기·LLM 없음)
 *
 * 흐름: LH 목록 → 신규·수정 탐지 → PDF 다운로드 → Storage → 텍스트 → 섹션 → LLM 추출
 *       → 스키마·자동 검증 → announcement_versions(UNVERIFIED | CONFLICT) → 신규면 푸시 대상 조회
 */
import { loadEnv, requireEnv } from "./config.js";
import { Repo } from "./db/supabase.js";
import { geocodeAddress } from "./geo/kakao.js";
import { LhClient, parseNoticeDetail, pickNoticePdf, type LhNoticeSummary } from "./lh/api.js";
import { extractFromText } from "./llm/extract.js";
import { extractPdfText, ocrFallback } from "./pdf/extract.js";
import { buildSections, sectionsToPrompt } from "./pdf/sections.js";
import { autoChecks } from "./validate/autoChecks.js";

const dryRun = process.argv.includes("--dry-run");
const env = loadEnv();
const lh = new LhClient(requireEnv(env, "LH_API_KEY"));
const repo = dryRun ? null : new Repo(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), env.PDF_BUCKET);

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function processNotice(notice: LhNoticeSummary): Promise<"new" | "modified" | "skipped" | "conflict"> {
  const existing = repo ? await repo.findByLhId(notice.lh_id) : null;
  // 1차 수정 탐지: 목록의 공고일·마감일. 바뀌지 않았으면 상세 호출 없이 건너뛴다.
  const listKey = `${notice.notice_date ?? ""}|${notice.apply_end ?? ""}`;
  const isNew = !existing;
  if (!isNew && existing.source_modified_at !== null && existing.source_modified_at.startsWith(listKey)) return "skipped";
  log(`${isNew ? "신규" : "수정 의심"} 공고: [${notice.housing_type}] ${notice.title} (${notice.status_raw ?? "?"})`);
  if (notice.unknown_codes.length) log(`  미지 코드 → 매핑 표 추가 필요: ${notice.unknown_codes.join(", ")}`);
  if (dryRun || !repo) return isNew ? "new" : "modified";

  const detail = parseNoticeDetail(await lh.getNoticeDetail(notice));
  // 2차: 상세의 정정 사유까지 포함한 키. 같으면 실제 변경 없음.
  const modifiedKey = `${listKey}|${detail.correction_reason ?? ""}`;
  if (!isNew && existing.source_modified_at === modifiedKey) return "skipped";
  if (detail.correction_reason) log(`  정정 사유: ${detail.correction_reason}`);
  const pdf = pickNoticePdf(detail.attachments);
  const announcementId = await repo.upsertAnnouncement({
    lh_id: notice.lh_id,
    title: notice.title,
    housing_type: notice.housing_type,
    region_code: notice.region_code,
    notice_date: notice.notice_date,
    apply_start: detail.apply_start,
    apply_end: detail.apply_end ?? notice.apply_end,
    source_modified_at: modifiedKey,
  });
  const version = (existing?.latest_version ?? 0) + 1;

  const conflict = async (reasons: string[]) => {
    await repo.insertVersion({ announcement_id: announcementId, version, status: "CONFLICT", source_modified_at: modifiedKey, conflict_reasons: reasons, extraction: null });
    log(`  CONFLICT v${version}: ${reasons.join(" / ")}`);
    return "conflict" as const;
  };

  if (!pdf) return conflict(["모집공고문 PDF 첨부를 찾지 못함"]);
  const bytes = await lh.downloadPdf(pdf.url);
  const pdfUrl = await repo.uploadPdf(notice.lh_id, version, bytes);

  let text = await extractPdfText(bytes);
  if (text.needsOcr) {
    const ocr = await ocrFallback(bytes);
    if (!ocr) return conflict([`스캔 PDF (텍스트 없는 페이지 ${text.emptyPages}/${text.pages.length}) — OCR 미연결`]);
    text = ocr;
  }
  const sections = buildSections(text.pages);
  const prompt = sectionsToPrompt(sections);
  const result = await extractFromText(prompt, { model: env.EXTRACTION_MODEL });
  log(`  LLM ${result.model} in=${result.usage.input_tokens} out=${result.usage.output_tokens} cache=${result.usage.cache_read_input_tokens}`);
  if (!result.output) return conflict([`추출 실패: ${result.error ?? "unknown"}`]);

  const issues = autoChecks(result.output);
  const status = issues.length ? "CONFLICT" : "UNVERIFIED";
  await repo.insertVersion({
    announcement_id: announcementId,
    version,
    status,
    source_modified_at: modifiedKey,
    conflict_reasons: issues,
    extraction: result.output,
    model: result.model,
    prompt_version: result.prompt_version,
    raw_text_chars: prompt.length,
  });

  // 좌표는 신규 공고에서 1회
  const address = result.output.address ?? detail.address;
  if (isNew && address && env.KAKAO_REST_API_KEY) {
    const geo = await geocodeAddress(address, env.KAKAO_REST_API_KEY).catch(() => null);
    await repo.upsertAnnouncement({
      lh_id: notice.lh_id,
      title: notice.title,
      housing_type: notice.housing_type,
      region_code: notice.region_code,
      notice_date: result.output.schedule.notice_date ?? notice.notice_date,
      apply_start: detail.apply_start ?? result.output.schedule.apply_start,
      apply_end: detail.apply_end ?? result.output.schedule.apply_end ?? notice.apply_end,
      pdf_url: pdfUrl,
      source_modified_at: modifiedKey,
      lat: geo?.lat,
      lng: geo?.lng,
      transit: geo?.transit,
    });
  }
  log(`  v${version} ${status}${issues.length ? `: ${issues.join(" / ")}` : ""}`);
  if (isNew) {
    const tokens = await repo.pushTargets(notice.region_code, notice.housing_type);
    log(`  푸시 대상 ${tokens.length}명 (발송은 검수 VERIFIED 후 — TODO M7)`);
  }
  return isNew ? "new" : "modified";
}

// 최신 공고부터. 유형 코드 순서(분양→임대→…)로 오는 목록을 공고일 내림차순으로 다시 정렬한다.
const list = (await lh.listAllHousingNotices())
  .filter((n) => n.status_raw !== "접수마감")
  .sort((a, b) => (b.notice_date ?? "").localeCompare(a.notice_date ?? ""));
log(`LH 주택 공고 ${list.length}건 (최근 90일, 접수마감 제외)${dryRun ? " (dry-run)" : ""}`);
const counts = { new: 0, modified: 0, skipped: 0, conflict: 0, failed: 0 };
let processed = 0;
for (const notice of list) {
  if (processed >= env.MAX_ANNOUNCEMENTS_PER_RUN) break;
  try {
    const r = await processNotice(notice);
    counts[r]++;
    if (r !== "skipped") processed++;
  } catch (err) {
    counts.failed++;
    log(`  실패 ${notice.lh_id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
log(`완료: ${JSON.stringify(counts)}`);
if (counts.failed > 0) process.exitCode = 1;
