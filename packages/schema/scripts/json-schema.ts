/**
 * zod 스키마 → JSON Schema 파일 생성.
 * 수집기(Python 워커를 쓸 경우)와 문서가 같은 스키마를 공유하기 위한 산출물.
 *   npm run schema:json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Announcement, AnnouncementVersion, ExtractionOutput, LoanProduct, UserProfile } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "json");
mkdirSync(outDir, { recursive: true });

const targets = {
  "extraction-output": ExtractionOutput,
  "announcement-version": AnnouncementVersion,
  announcement: Announcement,
  "user-profile": UserProfile,
  "loan-product": LoanProduct,
};

for (const [name, schema] of Object.entries(targets)) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
  writeFileSync(join(outDir, `${name}.schema.json`), JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote json/${name}.schema.json`);
}
