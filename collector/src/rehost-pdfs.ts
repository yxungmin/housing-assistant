/**
 * 기관 서버를 가리키는 공고문 주소를 우리 Storage로 옮긴다. `npm run pdf:rehost`
 *
 * 왜 필요한가 — 기관은 PDF를 내려받기용으로 준다 (2026-09-22 확인):
 *
 *   Content-Type: application/octet-stream
 *   Content-Disposition: attachment; filename="...공고문.pdf"
 *
 * 이러면 브라우저가 뷰어를 띄우지 않고 파일로 받는다. 앱에서 인앱 브라우저로 열어도 마찬가지다 —
 * 무엇으로 열지는 서버가 정하고 우리가 못 바꾼다. 그래서 파일을 우리 Storage에
 * `application/pdf`로 다시 올리고 주소를 그쪽으로 바꾼다. 그 주소부터는 바로 펼쳐지고 #page도 먹는다.
 *
 * 수집기(`run.ts`)를 거친 공고는 이미 이렇게 저장된다 (`uploadPdf`). 이 스크립트는 그 경로를
 * 타지 않고 들어온 것들 — 손으로 넣었거나 벤치마크 초안에서 온 행 — 을 뒤늦게 맞추는 용도다.
 *
 * LLM을 쓰지 않는다. 추출 비용이 들지 않는다.
 *
 *   npm run pdf:rehost            # 무엇을 옮길지 보여 주기만 한다
 *   npm run pdf:rehost -- --apply # 실제로 옮기고 주소를 바꾼다
 */
import { loadEnv, requireEnv } from "./config";
import { Repo } from "./db/supabase";

const env = loadEnv();
const apply = process.argv.includes("--apply");
const repo = new Repo(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), env.PDF_BUCKET);

interface Row {
  id: string;
  provider: string;
  lh_id: string;
  title: string;
  pdf_url: string | null;
  latest_version: number | null;
}

/** 이미 우리 Storage를 가리키면 건드리지 않는다 */
const isOurs = (url: string) => url.includes("/storage/v1/object/public/");

async function main(): Promise<void> {
  const { data, error } = await repo.sb
    .from("announcements")
    .select("id, provider, lh_id, title, pdf_url, latest_version")
    .not("pdf_url", "is", null);
  if (error) throw error;

  const rows = (data as Row[]).filter((r) => r.pdf_url && !isOurs(r.pdf_url));
  if (rows.length === 0) {
    console.log("옮길 것이 없습니다. 모든 공고문이 이미 우리 Storage를 가리킵니다.");
    return;
  }

  console.log(`기관 주소를 가리키는 공고 ${rows.length}건${apply ? "" : " (미리보기 — 실제로 옮기려면 --apply)"}`);
  let moved = 0;
  let failed = 0;

  for (const r of rows) {
    const label = `${r.provider} ${r.lh_id} · ${r.title.slice(0, 30)}`;
    if (!apply) {
      console.log(`  - ${label}\n    ${r.pdf_url}`);
      continue;
    }
    try {
      const res = await fetch(r.pdf_url!);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // 받은 게 PDF가 맞는지 본다. 기관 사이트가 오류 페이지를 200으로 주는 경우가 있다.
      const magic = new TextDecoder().decode(bytes.slice(0, 5));
      if (magic !== "%PDF-") throw new Error(`PDF가 아닌 응답 (${magic.replace(/[^\x20-\x7e]/g, "?")})`);

      const version = r.latest_version ?? 1;
      const url = await repo.uploadPdf(r.provider as "LH" | "SH", r.lh_id, version, bytes);
      const { error: upErr } = await repo.sb.from("announcements").update({ pdf_url: url }).eq("id", r.id);
      if (upErr) throw upErr;

      console.log(`  ✓ ${label} → ${url}`);
      moved++;
    } catch (e) {
      console.error(`  ✗ ${label}: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  if (apply) console.log(`\n옮김 ${moved}건, 실패 ${failed}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
