/**
 * 정답 fixture 만들기 1차 대조. 사람이 읽기 전에 기계가 할 수 있는 확인을 먼저 한다.
 *   npm run fixture:check              PDF가 있는 초안·fixture 전부
 *   npm run fixture:check -- 018       한 건
 *   npm run fixture:check -- --verbose 건별로 모두 펼쳐 본다
 *   npm run fixture:check -- --quiet   합계만
 *   npm run fixture:check -- 018 --promote --reviewed-by 윤영민
 *     사람이 14개 검수 단위를 다 본 뒤에 쓴다. 초안을 fixtures/로 옮기고 룰의 verified를 true로 바꾼다.
 *     기계가 문제로 본 항목이 하나라도 남아 있으면 거부한다. 기계 통과는 승격의 조건일 뿐 근거가 아니다.
 *
 * 각 룰·가격 행에 대해 세 가지를 본다. 판정은 하지 않는다 — 사람이 볼 목록을 줄이는 게 목적이다.
 *  1. 인용 쪽 번호가 맞는가        source.page의 텍스트에 source.text가 있는가 (공백 무시)
 *  2. 인용문이 원문에 있는가        어느 쪽에도 없으면 지어낸 근거일 수 있다
 *  3. 값이 인용문에 근거하는가      45420000 ↔ "4,542만원" 처럼 한국어 표기까지 맞춰 본다
 * 결과는 benchmark/output/<id>.check.json 에 남는다.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ExtractionOutput, type EligibilityRule, type Pricing } from "@housing/schema";
import { extractPdfText, type PdfPage } from "./pdf/extract";
import { fromRoot } from "./paths";

const FIXTURES = fromRoot("benchmark", "fixtures");
const OUT = fromRoot("benchmark", "output");
const PDFS = fromRoot("benchmark", "pdfs");

/** 공백·전각 괄호 등 표기 차이를 지운다. PDF 텍스트는 줄바꿈과 공백이 원문과 다르게 나온다. */
const norm = (s: string) => s.replace(/\s+/g, "").replace(/[（）]/g, (c) => (c === "（" ? "(" : ")"));
/** 숫자 비교용. 쉼표를 떼고 공백을 지운다. */
const normNum = (s: string) => norm(s).replace(/,/g, "");

/**
 * 45420000 → ["45420000", "4542만", ...] 공고문이 쓰는 표기까지 만든다.
 * 공고문 가격표는 천원 단위("514,020(천원)")나 만원 단위로 적는 일이 흔해서 나눈 값도 후보에 넣는다.
 */
function amountVariants(n: number): string[] {
  const out = new Set<string>([String(n)]);
  if (n % 1_000 === 0) out.add(String(n / 1_000));
  if (n % 10_000 === 0) out.add(`${n / 10_000}만`), out.add(String(n / 10_000));
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000);
    const rest = n % 100_000_000;
    out.add(`${eok}억`);
    if (rest === 0) out.add(`${eok}억원`);
    else if (rest % 10_000 === 0) out.add(`${eok}억${rest / 10_000}만`);
  }
  return [...out];
}

/** 인용문에 있는 두 자리 이상의 수 (쉼표 제거) */
const numbersIn = (s: string) => (s.match(/\d[\d,]*/g) ?? []).map((x) => x.replace(/,/g, "")).filter((x) => x.length >= 2);
/** 인용문의 한글 덩어리 (두 글자 이상) */
const wordsIn = (s: string) => (s.match(/[가-힣]{2,}/g) ?? []);

/** 한 낱말이 그 쪽에서 나오는 모든 위치 */
const positions = (hay: string, needle: string): number[] => {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
};

/** 표 한 행이 들어갈 만한 폭 (정규화 후 글자 수). 이 안에 인용문의 숫자가 모두 모여 있으면 같은 행으로 본다. */
const ROW_WINDOW = 300;

/** 인용문의 숫자들이 그 쪽의 한 구간(≈한 행) 안에 모여 있는가 */
function numbersInOneRow(nums: string[], page: string): boolean {
  if (nums.length <= 1) return true;
  const [first, ...rest] = nums;
  return positions(page, first!).some((at) =>
    rest.every((n) => positions(page, n).some((p) => Math.abs(p - at) <= ROW_WINDOW)),
  );
}

export type Reconstruction = "row" | "scattered" | "no";

/**
 * 인용문이 표에서 재구성된 것인가.
 * LLM은 표의 한 행을 "70% 2인가구 4,106,389원" 같은 문장으로 합쳐 적는다.
 * 그 문장은 원문에 통째로는 없지만 숫자와 낱말은 모두 그 쪽에 있다. 지어낸 근거와 구분해야 한다.
 *  - row       숫자가 모두 그 쪽의 한 구간에 모여 있다 → 실제로 있는 행일 가능성이 높다
 *  - scattered 숫자는 다 있지만 쪽 여기저기 흩어져 있다 → 다른 행의 값을 섞었을 수 있다. 사람이 봐야 한다.
 */
function reconstruction(quote: string, pageText: string): Reconstruction {
  const page = normNum(pageText);
  const nums = numbersIn(quote);
  if (!nums.every((n) => page.includes(n))) return "no";
  const words = wordsIn(quote);
  if (nums.length === 0 && words.length === 0) return "no";
  const hit = words.filter((w) => page.includes(w)).length;
  if (words.length > 0 && hit / words.length < 0.8) return "no";
  return numbersInOneRow(nums, page) ? "row" : "scattered";
}

export type Severity = "ok" | "warn" | "bad";

export interface Finding {
  kind: "rule" | "pricing" | "omission";
  track: string;
  /** 사람이 찾아갈 수 있게: 트랙 안에서의 위치 */
  index: number;
  label: string;
  page: number;
  severity: Severity;
  codes: string[];
  detail: string;
  quote: string;
  confidence?: number;
}

const CODE_TEXT: Record<string, string> = {
  page_out_of_range: "인용 쪽이 PDF 쪽수를 넘는다",
  page_mismatch: "인용문이 다른 쪽에 있다",
  quote_missing: "인용문을 원문에서 찾지 못했다",
  quote_partial: "인용문 일부만 원문과 맞는다",
  quote_reconstructed: "표의 한 행을 문장으로 재구성한 인용 (숫자가 그 쪽 한 구간에 모여 있다)",
  quote_scattered: "인용문의 숫자가 그 쪽에 흩어져 있다 (다른 행의 값을 섞었을 수 있다)",
  value_unsupported: "값을 그 쪽 어디에서도 찾지 못했다",
  value_off_quote: "값이 인용문 밖(같은 쪽)에 있다",
  low_confidence: "추출 신뢰도가 낮다",
  category_missing: "형제 트랙 대부분이 가진 조건이 이 트랙에만 없다 (누락 의심)",
  category_lonely: "이 조건이 트랙 하나에만 있다 (다른 트랙에도 해당하는지 확인)",
};

/** 인용문이 어느 쪽에 있는가. 없으면 앞 20자라도 걸리는 쪽을 찾는다. */
function locate(quote: string, pages: PdfPage[]): { exact: number[]; partial: number[] } {
  const q = norm(quote);
  const exact = pages.filter((p) => norm(p.text).includes(q)).map((p) => p.page);
  if (exact.length > 0 || q.length < 12) return { exact, partial: [] };
  const head = q.slice(0, 20);
  return { exact, partial: pages.filter((p) => norm(p.text).includes(head)).map((p) => p.page) };
}

function checkQuote(page: number, quote: string, pages: PdfPage[]): { codes: string[]; detail: string[] } {
  const codes: string[] = [];
  const detail: string[] = [];
  if (page > pages.length) {
    codes.push("page_out_of_range");
    detail.push(`p.${page} (PDF는 ${pages.length}쪽)`);
    return { codes, detail };
  }
  const { exact, partial } = locate(quote, pages);
  if (exact.includes(page)) return { codes, detail };
  const recon = reconstruction(quote, pages[page - 1]!.text);
  if (exact.length > 0) {
    codes.push("page_mismatch");
    detail.push(`인용은 p.${page}, 실제는 p.${exact.join("·")}`);
  } else if (recon === "row") {
    codes.push("quote_reconstructed");
  } else if (recon === "scattered") {
    codes.push("quote_scattered");
  } else if (partial.length > 0) {
    codes.push("quote_partial");
    detail.push(`앞부분만 p.${partial.join("·")}에 있다`);
  } else {
    codes.push("quote_missing");
  }
  return { codes, detail };
}

/** 값이 인용문에 없으면 인용된 쪽 전체에서라도 찾는다. 표 재구성 인용은 숫자가 다른 칸에 있다. */
function findAmount(v: number, quote: string, pageText: string): "quote" | "page" | "none" {
  const variants = amountVariants(v).map(normNum);
  if (variants.some((x) => normNum(quote).includes(x))) return "quote";
  if (variants.some((x) => normNum(pageText).includes(x))) return "page";
  return "none";
}

/** 숫자 값이 인용문(또는 그 쪽)에 있는가. 지역코드처럼 원문에 안 나오는 값은 건너뛴다. */
function checkValue(rule: EligibilityRule, pageText: string): { codes: string[]; detail: string[] } {
  const codes: string[] = [];
  const detail: string[] = [];
  if (rule.unit === "region_code" || typeof rule.value !== "number") return { codes, detail };
  // 0은 "무주택세대구성원"처럼 문장 자체가 근거라 숫자로 찾을 수 없다
  if (rule.value === 0) return { codes, detail };
  const money = rule.unit === "KRW" || rule.unit === "KRW_monthly";
  const where = money
    ? findAmount(rule.value, rule.source.text, pageText)
    : normNum(rule.source.text).includes(String(rule.value))
      ? "quote"
      : normNum(pageText).includes(String(rule.value))
        ? "page"
        : "none";
  if (where === "none") {
    codes.push("value_unsupported");
    detail.push(`${rule.value.toLocaleString("ko-KR")}${rule.unit ? ` ${rule.unit}` : ""}`);
  } else if (where === "page") {
    codes.push("value_off_quote");
  }
  return { codes, detail };
}

function checkPrice(p: Pricing, pageText: string): { codes: string[]; detail: string[] } {
  const codes: string[] = [];
  const detail: string[] = [];
  const missing: string[] = [];
  const offQuote: string[] = [];
  for (const [label, v] of [["보증금", p.deposit], ["월세", p.monthly_rent], ["분양가", p.sale_price]] as const) {
    // 장기전세의 월임대료 0처럼 "없음"을 뜻하는 0은 숫자로 확인할 수 없다
    if (v === undefined || v === 0) continue;
    const where = findAmount(v, p.source.text, pageText);
    if (where === "none") missing.push(`${label} ${v.toLocaleString("ko-KR")}`);
    else if (where === "page") offQuote.push(label);
  }
  if (missing.length > 0) {
    codes.push("value_unsupported");
    detail.push(missing.join(", "));
  }
  if (offQuote.length > 0) {
    codes.push("value_off_quote");
    detail.push(`인용문 밖: ${offQuote.join("·")}`);
  }
  return { codes, detail };
}

/** 오늘 날짜 (현지). toISOString은 UTC라 한국 오전에는 어제가 된다. */
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const LOW_CONFIDENCE = 0.7;

/** 사람이 꼭 봐야 하는 것(bad)과 표본만 봐도 되는 것(warn)을 가른다. */
const BAD = new Set(["quote_missing", "quote_partial", "quote_scattered", "value_unsupported", "page_out_of_range", "page_mismatch", "category_missing"]);
const severityOf = (codes: string[]): Severity => (codes.some((c) => BAD.has(c)) ? "bad" : codes.length > 0 ? "warn" : "ok");

/**
 * 빠진 조건을 찾는다.
 *
 * 나머지 검사는 전부 **있는 것**의 근거만 본다 — 인용이 원문에 있나, 값이 인용과 맞나.
 * 그래서 아예 안 뽑힌 조건은 원리적으로 안 걸린다. 그런데 자격 판정에서 더 위험한 쪽은
 * 그쪽이다. 틀린 값은 화면에서 눈에 띄지만, 빠진 조건은 "맞음"으로 조용히 넘어간다 —
 * 청약통장이 없는 사람에게 "조건 맞음"이라고 말하는 식이다.
 *
 * 모든 누락을 찾을 수는 없다(그러려면 정답을 이미 알아야 한다). 대신 값싸고 잘 맞는
 * 신호 하나를 쓴다: **같은 공고의 형제 트랙 대부분이 가진 조건이 한 트랙에만 없으면**
 * 그건 그 트랙이 예외인 것이거나 빠뜨린 것이다. 둘 다 사람이 봐야 한다.
 *
 * 2026-09-22에 018을 이걸로 다시 보니 청약통장 요건이 7개 트랙 중 1개에만 있었다.
 * 공고문 p.10은 면적 구간마다 그 요건을 적고 있다.
 */
const OMISSION_RATIO = 0.6;

function checkOmissions(gold: ExtractionOutput): Finding[] {
  const tracks = gold.tracks;
  if (tracks.length < 3) return []; // 비교할 형제가 없으면 판단 근거도 없다
  const has = tracks.map((t) => new Set(t.rules.map((r) => r.category)));
  const all = new Set(has.flatMap((s) => [...s]));
  const out: Finding[] = [];
  for (const cat of [...all].sort()) {
    const withIt = has.filter((s) => s.has(cat)).length;

    /**
     * 반대 신호도 본다. 한 트랙에만 있는 조건은 "그 트랙만의 특칙"일 수도 있지만
     * "거기서만 뽑히고 나머지는 빠뜨린 것"일 수도 있다. 018이 정확히 후자였다 —
     * 청약통장 요건이 7개 중 1개에만 있었고, 공고문은 면적 구간마다 그걸 요구한다.
     * 어느 쪽인지는 기계가 못 가린다. 그래서 문제로 세지 않고 눈에만 띄게 한다.
     */
    if (withIt === 1) {
      const owner = tracks[has.findIndex((s) => s.has(cat))]!;
      out.push({
        kind: "omission",
        track: owner.name,
        index: -1,
        label: `${cat} 조건이 이 트랙에만 있다 (나머지 ${tracks.length - 1}개에는 없다)`,
        page: 0,
        severity: "warn",
        codes: ["category_lonely"],
        detail: "그 트랙만의 특칙인지, 다른 트랙에서 빠진 것인지 공고문으로 확인한다",
        quote: "",
      });
      continue;
    }

    if (withIt / tracks.length < OMISSION_RATIO) continue;
    tracks.forEach((t, i) => {
      if (has[i]!.has(cat)) return;
      out.push({
        kind: "omission",
        track: t.name,
        index: -1,
        label: `${cat} 조건이 없다 (형제 트랙 ${withIt}/${tracks.length}개는 갖고 있다)`,
        page: 0,
        severity: "bad",
        codes: ["category_missing"],
        detail: "이 트랙만 예외인지, 추출에서 빠진 것인지 공고문으로 확인한다",
        quote: "",
      });
    });
  }
  return out;
}

export function checkCase(gold: ExtractionOutput, pages: PdfPage[]): Finding[] {
  const findings: Finding[] = checkOmissions(gold);
  for (const track of gold.tracks) {
    track.rules.forEach((rule, i) => {
      const pageText = pages[rule.source.page - 1]?.text ?? "";
      const q = checkQuote(rule.source.page, rule.source.text, pages);
      const v = checkValue(rule, pageText);
      const codes = [...q.codes, ...v.codes];
      if (rule.confidence < LOW_CONFIDENCE) codes.push("low_confidence");
      const severity = severityOf(codes);
      findings.push({
        kind: "rule",
        track: track.name,
        index: i,
        label: `${rule.category} ${rule.operator} ${JSON.stringify(rule.value)}${rule.unit ? ` ${rule.unit}` : ""}`,
        page: rule.source.page,
        severity,
        codes,
        detail: [...q.detail, ...v.detail].join(" / "),
        quote: rule.source.text,
        confidence: rule.confidence,
      });
    });
    track.pricing.forEach((p, i) => {
      const pageText = pages[p.source.page - 1]?.text ?? "";
      const q = checkQuote(p.source.page, p.source.text, pages);
      const v = checkPrice(p, pageText);
      const codes = [...q.codes, ...v.codes];
      const severity = severityOf(codes);
      findings.push({
        kind: "pricing",
        track: track.name,
        index: i,
        label: `${p.unit_type}${p.tier ? ` · ${p.tier}` : ""} 보증금 ${p.deposit?.toLocaleString("ko-KR") ?? "-"} / 월 ${p.monthly_rent?.toLocaleString("ko-KR") ?? "-"}`,
        page: p.source.page,
        severity,
        codes,
        detail: [...q.detail, ...v.detail].join(" / "),
        quote: p.source.text,
      });
    });
  }
  return findings;
}

interface CaseFile {
  id: string;
  source: "fixture" | "draft";
  path: string;
  pdf: string;
}

function collectCases(only: string[]): CaseFile[] {
  const ids = new Set<string>();
  const byId = new Map<string, CaseFile>();
  const add = (id: string, source: "fixture" | "draft", path: string) => {
    if (source === "draft" && byId.has(id)) return; // fixture 우선
    byId.set(id, { id, source, path, pdf: join(PDFS, `${id}.pdf`) });
    ids.add(id);
  };
  if (existsSync(FIXTURES)) {
    for (const f of readdirSync(FIXTURES)) {
      if (f.endsWith(".json") && !f.endsWith(".example.json")) add(f.replace(".json", ""), "fixture", join(FIXTURES, f));
    }
  }
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) {
      if (f.endsWith(".draft.json")) add(f.replace(".draft.json", ""), "draft", join(OUT, f));
    }
  }
  const all = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return only.length > 0 ? all.filter((c) => only.includes(c.id)) : all;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  const verbose = args.includes("--verbose");
  const promote = args.includes("--promote");
  const byIdx = args.indexOf("--reviewed-by");
  const reviewedBy = byIdx >= 0 ? args[byIdx + 1] : undefined;
  const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--reviewed-by");

  const cases = collectCases(only);
  if (cases.length === 0) {
    console.log("대조할 초안이 없다. benchmark/output/*.draft.json 또는 benchmark/fixtures/*.json 을 먼저 만든다.");
    return;
  }

  mkdirSync(OUT, { recursive: true });
  let totalChecked = 0;
  let totalClean = 0;
  const skipped: string[] = [];

  for (const c of cases) {
    if (!existsSync(c.pdf)) {
      skipped.push(c.id);
      continue;
    }
    const raw = JSON.parse(readFileSync(c.path, "utf8"));
    const parsed = ExtractionOutput.safeParse(raw.gold);
    if (!parsed.success) {
      console.log(`\n${c.id}: 스키마 오류 — ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const { pages, needsOcr } = await extractPdfText(new Uint8Array(readFileSync(c.pdf)));
    if (needsOcr) console.log(`${c.id}: 텍스트 레이어가 거의 없다 (스캔 PDF). 대조 결과를 믿지 말 것.`);
    const findings = checkCase(parsed.data, pages);
    const bad = findings.filter((f) => f.severity === "bad");
    const warn = findings.filter((f) => f.severity === "warn");
    totalChecked += findings.length;
    totalClean += findings.length - bad.length - warn.length;

    console.log(`\n=== ${c.id} (${c.source}, PDF ${pages.length}쪽) — ${findings.length}건 중 통과 ${findings.length - bad.length - warn.length} · 확인 ${warn.length} · 문제 ${bad.length} ===`);
    const counts = new Map<string, number>();
    for (const f of findings) for (const code of f.codes) counts.set(code, (counts.get(code) ?? 0) + 1);
    for (const [code, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${CODE_TEXT[code] ?? code}: ${n}건`);

    // 사람은 항목 하나씩이 아니라 공고문 한 쪽을 펴 놓고 본다. 검수 단위를 쪽으로 묶어 준다.
    if (!quiet && !verbose) {
      const units = new Map<string, Finding[]>();
      for (const f of [...bad, ...warn]) {
        const key = `${f.page}|${f.kind}`;
        units.set(key, [...(units.get(key) ?? []), f]);
      }
      console.log(`  검수 단위 ${units.size}개 (공고문 한 쪽을 펴 놓고 한 번에 본다):`);
      for (const [key, fs] of [...units].sort((a, b) => Number(a[0].split("|")[0]) - Number(b[0].split("|")[0]))) {
        const [page, kind] = key.split("|");
        const nBad = fs.filter((f) => f.severity === "bad").length;
        const codes = [...new Set(fs.flatMap((f) => f.codes))].map((c) => CODE_TEXT[c] ?? c);
        const where = kind === "omission" ? "트랙 전체" : `p.${page} ${kind === "rule" ? "조건" : "가격"}`;
        console.log(`   ${nBad > 0 ? "✗" : "△"} ${where} ${fs.length}건${nBad > 0 ? ` (문제 ${nBad})` : ""} — ${codes.join(" / ")}`);
        console.log(`      예: ${fs[0]!.label}`);
        console.log(`      「${fs[0]!.quote.slice(0, 70)}${fs[0]!.quote.length > 70 ? "…" : ""}」`);
      }
    }
    if (verbose) {
      for (const f of [...bad, ...warn]) {
        const mark = f.severity === "bad" ? "✗" : "△";
        console.log(`  ${mark} [${f.track}] ${f.kind} #${f.index} p.${f.page} ${f.label}`);
        console.log(`      ${f.codes.map((x) => CODE_TEXT[x] ?? x).join(", ")}${f.detail ? ` — ${f.detail}` : ""}`);
        console.log(`      「${f.quote.slice(0, 90)}${f.quote.length > 90 ? "…" : ""}」`);
      }
    }
    writeFileSync(join(OUT, `${c.id}.check.json`), JSON.stringify({ id: c.id, source: c.source, pdf_pages: pages.length, findings }, null, 1));

    if (promote) {
      if (!reviewedBy) {
        console.log(`  승격하지 않음: --reviewed-by <이름>이 필요하다. 정답은 사람이 확인했다는 기록이 있어야 정답이다.`);
      } else if (bad.length > 0) {
        console.log(`  승격하지 않음: 기계가 문제로 본 항목이 ${bad.length}건 남아 있다. 고치고 다시 돌린다.`);
      } else {
        const gold = {
          ...parsed.data,
          tracks: parsed.data.tracks.map((t) => ({ ...t, rules: t.rules.map((r) => ({ ...r, verified: true })) })),
        };
        const target = join(FIXTURES, `${c.id}.json`);
        writeFileSync(target, JSON.stringify({ id: c.id, pdf: `${c.id}.pdf`, reviewed_by: reviewedBy, reviewed_at: localDate(), gold }, null, 1));
        console.log(`  승격: ${target} (${reviewedBy} 확인, 룰 ${gold.tracks.reduce((a, t) => a + t.rules.length, 0)}건)`);
      }
    }
  }

  console.log(`\n합계 ${totalChecked}건 대조, 기계 통과 ${totalClean}건 (${totalChecked ? Math.round((totalClean / totalChecked) * 100) : 0}%).`);
  if (skipped.length > 0) console.log(`PDF 없어 건너뜀: ${skipped.join(", ")} — benchmark/pdfs/<id>.pdf 가 필요하다.`);
  console.log("기계 통과는 '원문에 그 문장이 있고 숫자가 그 문장과 맞는다'는 뜻일 뿐, 조건을 옳게 해석했다는 뜻이 아니다. 확정은 사람이 한다.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
