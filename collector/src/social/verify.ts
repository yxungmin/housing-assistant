/**
 * 대본을 사실과 다시 대조한다. 템플릿이 쓴 대본이든 Claude가 다듬은 대본이든 **똑같이** 여기를 지난다.
 *
 * 한 번 틀린 숫자를 올리면 계정 신뢰가 돌아오지 않는다 — 82세대를 28세대로, 9/28을 9/29로.
 * 그래서 문장에 나온 숫자·날짜·대상·지역·유형을 전부 facts.ts의 값과 맞춰 보고, 하나라도 없으면 게시 후보에서 뺀다.
 * 사람이 보고 올리더라도 이 검사를 먼저 통과한 것만 본다.
 *
 * 금지 표현은 앱과 같다(CLAUDE.md "확정적 문구 금지"): "신청 가능"·"자격 충족" 대신 "신청 대상".
 * 게시물은 그 사람의 조건을 모르니 더더욱 단정할 수 없다.
 */
import type { SocialFacts, Target } from "./facts";
import { daysLeft, md, priceLines, splitLines, whoLines, type ReelScript } from "./script";

export interface Verdict {
  ok: boolean;
  /** 게시하면 안 되는 것 */
  errors: string[];
  /** 올릴 수는 있지만 사람이 볼 것 (줄이 길다 등) */
  warnings: string[];
}

const BANNED: RegExp[] = [
  /신청\s*가능/,
  /자격\s*(충족|있음|이\s*돼|이\s*됩)/,
  /당첨\s*(보장|확정)/,
  /누구나/,
  /100\s*%/,
  /확정\s*공급/,
  // "무조건"은 "무조건 되는 건 아니에요"처럼 부정할 때만 쓴다 (조건주의 릴스)
  /무조건(?!\s*되는\s*(건|거|게)\s*아니)/,
];

const TARGET_WORDS: [RegExp, Target[]][] = [
  [/대학생/, ["대학생"]],
  [/청년/, ["청년"]],
  [/예비\s*신혼/, ["예비신혼부부"]],
  [/신혼/, ["신혼부부", "예비신혼부부"]],
  [/신생아/, ["신생아 가구"]],
  [/한부모/, ["한부모"]],
  [/고령자|어르신|65세/, ["고령자"]],
  [/수급자/, ["수급자"]],
  [/주거약자/, ["주거약자"]],
  [/장애인/, ["장애인", "주거약자"]],
  [/국가유공자|유공자/, ["국가유공자"]],
];

const KINDS = ["영구임대", "장기전세", "통합공공임대", "전세임대", "국민임대", "행복주택", "신혼희망타운", "매입임대", "공공분양"];
const REGION_NAMES = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

/**
 * 대본에 나올 수 있는 숫자들 — 전부 사실에서 나온다.
 * 금액은 대본과 **같은 함수**(money.ts, priceLines·whoLines·splitLines)로 사실을 적어 본 뒤 그 안의 숫자만 허용한다.
 * 표기가 두 벌이면 맞는 숫자도 틀렸다고 나온다.
 */
function allowedNumbers(f: SocialFacts, today: Date): Set<string> {
  const out = new Set<string>();
  if (f.supply) out.add(String(f.supply.value.count));
  if (f.area) f.area.value.forEach((a) => out.add(String(a)));
  for (const s of f.splits) for (const m of s.value.match(/\d+/g) ?? []) out.add(m);
  const left = daysLeft(f.apply.end, today);
  if (left !== null && left >= 0) out.add(String(left));
  const texts = [...priceLines(f), ...whoLines(f), ...(splitLines(f) ?? [])];
  for (const t of texts) for (const m of t.replace(/\d{1,2}\/\d{1,2}/g, " ").match(/\d[\d,]*/g) ?? []) out.add(m.replace(/,/g, ""));
  return out;
}

function allowedDates(f: SocialFacts): Set<string> {
  return new Set([md(f.apply.start), md(f.apply.end), md(f.winnerAnnounce)].filter(Boolean));
}

export function verifyScript(script: ReelScript, f: SocialFacts, today = new Date()): Verdict {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sceneText = script.scenes.flatMap((s) => s.lines);
  const all = [...sceneText, script.caption, script.comment ?? "", ...script.hashtags].join("\n");

  // 1. 날짜 — "9/28" 꼴은 통째로 대조한다. 날짜를 뺀 나머지에서 숫자를 본다
  const dates = allowedDates(f);
  for (const m of all.matchAll(/(\d{1,2})\/(\d{1,2})/g)) {
    if (!dates.has(`${Number(m[1])}/${Number(m[2])}`)) errors.push(`공고에 없는 날짜: ${m[0]}`);
  }
  const withoutDates = all.replace(/\d{1,2}\/\d{1,2}/g, " ");

  // 2. 숫자 — 모집 수·면적·D-n·순위 수 말고는 나올 수 없다
  const nums = allowedNumbers(f, today);
  for (const m of withoutDates.matchAll(/\d[\d,]*/g)) {
    const n = m[0].replace(/,/g, "");
    if (!nums.has(n)) errors.push(`공고 사실에 없는 숫자: ${m[0]}`);
  }

  // 3. 대상 — 대본이 부르는 사람이 이 공고의 대상이어야 한다
  const targets = new Set(f.targets.map((t) => t.value));
  for (const [re, allowed] of TARGET_WORDS) {
    const hit = all.match(re);
    if (hit && !allowed.some((t) => targets.has(t))) errors.push(`이 공고의 대상이 아닌 사람을 부름: ${hit[0]}`);
  }

  // 4. 지역·유형
  // 앞에 한글이 붙어 있으면 지역 이름이 아니다 — "세대구성원" 안의 "대구"를 지역으로 잡았다
  for (const r of REGION_NAMES) {
    if (new RegExp(`(?<![가-힣])${r}`).test(all) && r !== f.region && !(f.district ?? "").includes(r)) errors.push(`다른 지역 이름: ${r}`);
  }
  for (const d of all.match(/[가-힣]+구(?=[\s·,]|$)/gm) ?? []) {
    if (/[가-힣]{1,3}구$/.test(d) && d !== f.district && !/(지역|입구|출구|요구|연구|도구|친구|가구)$/.test(d)) errors.push(`다른 구 이름: ${d}`);
  }
  for (const k of KINDS) if (all.includes(k) && k !== f.kind) errors.push(`다른 공급 유형: ${k}`);

  // 5. 금지 표현
  for (const re of BANNED) {
    const hit = all.match(re);
    if (hit) errors.push(`단정 표현: "${hit[0]}"`);
  }

  // 6. 고지 — 가구 상황에 따라 달라진다는 말은 빠질 수 없다
  if (!/달라질 수 있어요|달라질 수 있습니다/.test(script.caption)) errors.push("캡션에 '가구 상황에 따라 달라질 수 있어요' 고지가 없다");

  // 7. 형식 — 영상 템플릿이 받을 수 있는가
  let prev = 0;
  for (const s of script.scenes) {
    if (s.at[0] < prev || s.at[1] <= s.at[0]) errors.push(`장면 시간이 어긋남: ${s.kind} ${s.at.join("~")}`);
    prev = s.at[1];
    for (const line of s.lines) if ([...line].length > 18) warnings.push(`화면 한 줄이 길다(${[...line].length}자): ${line}`);
  }
  if (prev > 15) warnings.push(`릴스가 15초를 넘는다: ${prev}초`);
  if (f.apply.end && !script.caption.includes(md(f.apply.end))) warnings.push("캡션에 접수 마감일이 없다");

  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
