/**
 * 공고가 정정되면 올린 게시물에 **고정 댓글**로 알린다 (2026-09-23 결정).
 *
 * 게시물 자체는 고치지 않는다 — 릴스 영상은 올린 뒤 바꿀 수 없고, 캡션만 몰래 고치면 이미 본 사람은
 * 바뀐 줄 모른다. 지우는 것도 답이 아니다. 무엇이 바뀌었는지 맨 위 댓글로 적는 게 이 계정을 믿게 하는 방식이다.
 *
 * 비교는 게시물에 **나온 사실**만 한다(접수일·모집 수·면적·대상·지역·유형·당첨자 발표). 나오지 않은 조건이
 * 바뀐 것까지 댓글로 알리면 소음이 된다 — 그건 앱의 관심 공고 변경 알림(lib/changes.ts)이 한다.
 * 댓글 문안도 재대조한다. 정정 안내가 또 틀리면 끝이다.
 */
import type { SocialFacts } from "./facts";
import { md } from "./script";

export interface Correction {
  /** 무엇이 바뀌었나 — 사람이 읽는 한 줄씩 */
  changes: string[];
  /** 고정 댓글 문안 */
  comment: string;
  /** 댓글에 나온 숫자·날짜가 전부 이전·이후 사실에 있는가 */
  ok: boolean;
  errors: string[];
}

const supplyText = (f: SocialFacts) => (f.supply ? `${f.supply.value.count.toLocaleString("ko-KR")}${f.supply.value.unit}` : "");
const areaText = (f: SocialFacts) => (f.area ? (f.area.value[0] === f.area.value[1] ? `${f.area.value[0]}㎡` : `${f.area.value[0]}~${f.area.value[1]}㎡`) : "");
const targetsText = (f: SocialFacts) => f.targets.map((t) => (t.value === "일반" ? "일반공급" : t.value)).join("·");

/** 바뀐 것이 없으면 null */
export function detectCorrection(before: SocialFacts, after: SocialFacts): Correction | null {
  const changes: string[] = [];
  const diff = (label: string, a: string, b: string) => {
    if (a !== b) changes.push(`${label} ${a || "없음"} → ${b || "없음"}`);
  };
  diff("접수 시작", md(before.apply.start), md(after.apply.start));
  diff("접수 마감", md(before.apply.end), md(after.apply.end));
  diff("모집", supplyText(before), supplyText(after));
  diff("전용면적", areaText(before), areaText(after));
  diff("신청 대상", targetsText(before), targetsText(after));
  diff("지역", [before.region, before.district].filter(Boolean).join(" "), [after.region, after.district].filter(Boolean).join(" "));
  diff("공급 유형", before.kind, after.kind);
  diff("당첨자 발표", md(before.winnerAnnounce), md(after.winnerAnnounce));
  if (changes.length === 0) return null;

  const comment = [
    "[정정 안내] 이 공고가 정정됐어요.",
    ...changes.map((c) => `• ${c}`),
    "",
    "정정된 공고문 기준으로 다시 확인해 주세요. 게시물 내용은 정정 전 기준이에요.",
  ].join("\n");

  // 재대조: 댓글의 숫자·날짜는 이전 또는 이후 사실에서만 나올 수 있다
  const errors: string[] = [];
  const dates = new Set([before, after].flatMap((f) => [md(f.apply.start), md(f.apply.end), md(f.winnerAnnounce)]).filter(Boolean));
  for (const m of comment.matchAll(/(\d{1,2})\/(\d{1,2})/g)) if (!dates.has(`${Number(m[1])}/${Number(m[2])}`)) errors.push(`사실에 없는 날짜: ${m[0]}`);
  const nums = new Set<string>();
  for (const f of [before, after]) {
    if (f.supply) nums.add(String(f.supply.value.count));
    f.area?.value.forEach((a) => nums.add(String(a)));
  }
  for (const m of comment.replace(/\d{1,2}\/\d{1,2}/g, " ").matchAll(/\d[\d,]*/g)) {
    if (!nums.has(m[0].replace(/,/g, ""))) errors.push(`사실에 없는 숫자: ${m[0]}`);
  }
  return { changes, comment, ok: errors.length === 0, errors };
}
