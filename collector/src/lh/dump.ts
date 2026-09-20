/**
 * M1 확인용: LH API 원본 응답을 그대로 파일로 남긴다.
 *   npm run lh:dump            → collector/.cache/lh-list.json, lh-detail-<PAN_ID>.json
 * 필드명이 api.ts의 가정과 다르면 api.ts 한 곳만 고친다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv, requireEnv } from "../config";
import { LhClient, parseNoticeDetail, parseNoticeList, pickNoticePdf } from "./api";
import { fromRoot } from "../paths";

const env = loadEnv();
const client = new LhClient(requireEnv(env, "LH_API_KEY"));
mkdirSync(fromRoot("collector", ".cache"), { recursive: true });

const list = await client.listNotices({ pageSize: 20 });
writeFileSync(fromRoot("collector", ".cache", "lh-list.json"), JSON.stringify(list, null, 2));
console.log(`한 페이지 ${parseNoticeList(list).length}건 저장 (lh-list.json)`);

const notices = await client.listAllHousingNotices();
const byType: Record<string, number> = {};
for (const n of notices) byType[n.housing_type] = (byType[n.housing_type] ?? 0) + 1;
console.log(`최근 90일 주택 공고 ${notices.length}건: ${JSON.stringify(byType)}`);
const unknown = notices.filter((n) => n.unknown_codes.length);
if (unknown.length) console.log(`미지 코드 ${unknown.length}건: ${[...new Set(unknown.flatMap((n) => n.unknown_codes))].join(" | ")}`);
for (const n of notices.slice(0, 8)) {
  console.log(`- [${n.housing_type}] ${n.title} (${n.region_name}) ${n.status_raw} 마감 ${n.apply_end ?? "?"}`);
}
const first = notices.find((n) => n.status_raw === "공고중") ?? notices[0];
if (first) {
  const detail = await client.getNoticeDetail(first);
  writeFileSync(fromRoot("collector", ".cache", `lh-detail-${first.lh_id}.json`), JSON.stringify(detail, null, 2));
  const parsed = parseNoticeDetail(detail);
  console.log(`상세: ${parsed.complex_name ?? "?"} ${parsed.households ?? "?"}세대, 접수 ${parsed.apply_start ?? "?"}~${parsed.apply_end ?? "?"}, 주소: ${parsed.address ?? "?"}`);
  console.log(`첨부 ${parsed.attachments.length}건: ${parsed.attachments.map((a) => a.kind ?? a.name).join(", ")}`);
  console.log(`공고문 PDF: ${pickNoticePdf(parsed.attachments)?.url ?? "(없음 → 스크래핑 필요)"}`);
}
