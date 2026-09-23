/**
 * 릴스 대본 + 캡션. 템플릿으로 먼저 만들고(LLM 없음), 켜져 있으면 Claude가 문장만 다듬는다(copy.ts).
 * 어느 쪽이든 verify.ts를 통과해야 게시 후보가 된다.
 *
 * 원칙 — 공고 사실은 충분히 주고, **개인별 판단만** 앱으로 넘긴다.
 *  "소득기준은 앱에서 확인하세요"(숨기기) 대신 "맞벌이는 소득 기준이 따로 있어요 → 내 소득으로 되는지는 앱에서"(사실 + 판단 위임).
 *  ✓는 "이 사람들도 신청 대상"이라는 사실이지 "당신이 된다"가 아니다. △는 "기준이 있고 사람마다 갈린다".
 *  앱과 같은 금지 표현을 쓴다: "신청 가능", "자격 충족", "무조건" 같은 단정은 쓰지 않는다 (verify.ts).
 *
 * 영상 템플릿(Remotion)은 이 JSON만 받아 늘 같은 브랜드 화면으로 그린다 — 화면을 매번 새로 만들 이유가 없다.
 */
import { z } from "zod";
import type { SocialFacts } from "./facts";

/** 자동으로 만드는 세 종류. 조건주의가 앱 기능과 가장 잘 이어진다 */
export const ContentType = z.enum(["new", "deadline", "caution"]);
export type ContentType = z.infer<typeof ContentType>;

export const Scene = z.object({
  /** 초 단위 [시작, 끝] */
  at: z.tuple([z.number(), z.number()]),
  kind: z.enum(["hook", "place", "checks", "split", "cta"]),
  lines: z.array(z.string().min(1)).min(1).max(4),
});

export const ReelScript = z.object({
  type: ContentType,
  scenes: z.array(Scene).min(3).max(6),
  caption: z.string().min(1),
  /** 첫 댓글. 다운로드 링크가 생기기 전에는 없다 */
  comment: z.string().nullable(),
  hashtags: z.array(z.string()).max(8),
});
export type ReelScript = z.infer<typeof ReelScript>;

export interface ScriptOptions {
  /** 앱 다운로드 링크. 출시 전이라 지금은 없다 — 없으면 캡션·댓글에서 링크 문장을 뺀다 */
  appLink?: string | null;
  today?: Date;
}

/** "2026-09-28" → "9/28" */
export const md = (iso?: string): string => {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${m}/${d}`;
};

export const daysLeft = (iso: string | undefined, today: Date): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
};

/**
 * 게시물 첫 줄에 쓸 대상. 제목이 대상을 말하면 그걸 쓰고(facts.ts가 제목 대상을 앞에 둔다),
 * 일반공급이 있는 공고는 특정 계층으로 좁혀 부르지 않는다 — 주거약자용 트랙 하나 때문에
 * 양산 국민임대가 "경남 장애인 국민임대"가 될 뻔했다.
 */
export function headlineTarget(f: SocialFacts): string {
  const fromTitle = f.targets.filter((x) => x.source?.text === f.title).map((x) => x.value);
  if (fromTitle.length) return fromTitle.includes("신혼부부") ? "신혼부부" : fromTitle[0]!;
  if (f.targets.some((x) => x.value === "일반")) return "";
  const t = f.targets.map((x) => x.value);
  if (t.includes("신혼부부") && t.includes("예비신혼부부")) return "신혼부부";
  return t[0] ?? "";
}

/** 대상 한 줄. 일반공급은 "누구나"가 아니라 "일반공급도 있어요"다 (verify.ts 금지 표현) */
const targetLine = (v: string) => (v === "일반" ? "일반공급도 있어요" : `${v}도 신청 대상`);

const supplyText = (f: SocialFacts) => (f.supply ? `모집 ${f.supply.value.count.toLocaleString("ko-KR")}${f.supply.value.unit}` : "");
const areaText = (f: SocialFacts) => (f.area ? (f.area.value[0] === f.area.value[1] ? `전용 ${f.area.value[0]}㎡` : `전용 ${f.area.value[0]}~${f.area.value[1]}㎡`) : "");
const applyText = (f: SocialFacts) => (f.apply.start && f.apply.end ? `접수 ${md(f.apply.start)}~${md(f.apply.end)}` : f.apply.end ? `접수 ~${md(f.apply.end)}` : "");

/** 체크 줄: ✓ 대상(사실), △ 사람마다 갈리는 기준. 화면에 네 줄까지. 첫 줄에서 부른 대상을 먼저 둔다 */
function checkLines(f: SocialFacts, lead: string): string[] {
  const values = f.targets.map((t) => t.value as string);
  const ordered = lead && values.includes(lead) ? [lead, ...values.filter((v) => v !== lead)] : values;
  const yes = ordered.slice(0, 2).map((v) => `✓ ${targetLine(v)}`);
  const maybe = [
    f.criteria.homeless ? "✓ 무주택 요건" : null,
    f.criteria.income ? "△ 소득 기준 있음" : null,
    f.criteria.asset ? "△ 자산 기준 있음" : null,
  ].filter((x): x is string => !!x);
  return [...yes, ...maybe].slice(0, 4);
}

export function templateScript(f: SocialFacts, type: ContentType, opts: ScriptOptions = {}): ReelScript {
  const today = opts.today ?? new Date();
  const who = headlineTarget(f);
  const head = [f.region, who, f.kind].filter(Boolean).join(" ");
  const split = f.splits[0]?.value;
  const left = daysLeft(f.apply.end, today);

  const hook =
    type === "deadline" && left !== null
      ? [head, left === 0 ? "오늘 접수 마감이에요" : `접수 마감 D-${left}`]
      : type === "caution" && split
        ? [head, `${who || "이 공고"}라고 다 되는 건 아니에요`]
        : [head, "새 공고가 올라왔어요"];

  const scenes: ReelScript["scenes"] = [
    { at: [0, 2], kind: "hook", lines: hook },
    { at: [2, 5], kind: "place", lines: [[f.district ?? f.region, areaText(f)].filter(Boolean).join(" · "), supplyText(f), applyText(f)].filter(Boolean) },
    { at: [5, 8], kind: "checks", lines: checkLines(f, who) },
  ];
  if (split) scenes.push({ at: [8, 11], kind: "split", lines: ["근데 여기서 갈려요", split] });
  scenes.push({ at: [split ? 11 : 8, split ? 14 : 11], kind: "cta", lines: ["내 조건에 맞는지는", "앱에서 바로 확인"] });

  const bullets = [
    supplyText(f),
    ...f.targets.map((t) => t.value).slice(0, 4).map(targetLine),
    [f.criteria.income ? "소득" : null, f.criteria.asset ? "자산" : null].filter(Boolean).join("·") ? `${[f.criteria.income ? "소득" : null, f.criteria.asset ? "자산" : null].filter(Boolean).join("·")} 기준 있음` : "",
    applyText(f),
  ].filter(Boolean);

  const caption = [
    `${[f.region, f.district].filter(Boolean).join(" ")} ${f.kind} ${type === "deadline" ? "접수 마감 임박" : "신규 공고"}`,
    "",
    ...bullets.map((b) => `• ${b}`),
    ...(split ? ["", `${split} — 내 조건으로 되는지는 앱에서 확인할 수 있어요.`] : []),
    "",
    "공고 조건은 가구 상황에 따라 달라질 수 있어요. 신청 전에 공고문을 꼭 확인해 주세요.",
    ...(opts.appLink ? ["", "내 조건과 비교하기 → 프로필 링크"] : []),
  ].join("\n");

  return {
    type,
    scenes,
    caption,
    comment: opts.appLink ? "공고 상세 조건과 내 조건 비교는 프로필 링크의 앱에서 확인할 수 있어요." : null,
    hashtags: ["#공공임대", `#${f.kind.replace(/\s/g, "")}`, `#${f.region}`, ...(who ? [`#${who.replace(/\s/g, "")}`] : []), "#LH", "#청약"].slice(0, 8),
  };
}

/** 이 공고로 어떤 종류를 만들지. 마감 임박은 접수 중이고 3일 이내일 때, 조건주의는 갈리는 지점이 있을 때 */
export function typesFor(f: SocialFacts, today = new Date()): ContentType[] {
  const out: ContentType[] = ["new"];
  const left = daysLeft(f.apply.end, today);
  const started = f.apply.start ? (daysLeft(f.apply.start, today) ?? 0) <= 0 : true;
  if (left !== null && left >= 0 && left <= 3 && started) out.push("deadline");
  if (f.splits.length > 0 && headlineTarget(f)) out.push("caution");
  return out;
}
