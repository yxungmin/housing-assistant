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
import { limitMan, rangeMan } from "./money";

/** 자동으로 만드는 세 종류. 조건주의가 앱 기능과 가장 잘 이어진다 */
export const ContentType = z.enum(["new", "deadline", "caution"]);
export type ContentType = z.infer<typeof ContentType>;

export const Scene = z.object({
  /** 초 단위 [시작, 끝] */
  at: z.tuple([z.number(), z.number()]),
  /**
   * hook: 무슨 공고인가(유형·지역·모집·접수) / price: 얼마인가 / who: 누가 되나(나이·소득·자산 숫자)
   * split: 공고 안에서 갈리는 지점(숫자로) / cta: 앱 안내 — **앱 이야기는 여기 한 번뿐이다**
   */
  kind: z.enum(["hook", "price", "who", "split", "cta"]),
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

const supplyText = (f: SocialFacts) => (f.supply ? `모집 ${f.supply.value.count.toLocaleString("ko-KR")}${f.supply.value.unit}` : "");
const areaText = (f: SocialFacts) => (f.area ? (f.area.value[0] === f.area.value[1] ? `전용 ${f.area.value[0]}㎡` : `전용 ${f.area.value[0]}~${f.area.value[1]}㎡`) : "");
const applyText = (f: SocialFacts) => (f.apply.start && f.apply.end ? `접수 ${md(f.apply.start)}~${md(f.apply.end)}` : f.apply.end ? `접수 ~${md(f.apply.end)}` : "");

/** 장면에 나오는 첫 줄들. 공고마다 없는 값은 건너뛴다 — 없는 숫자를 지어내지 않는다 */
export function priceLines(f: SocialFacts): string[] {
  const r = f.rent?.value;
  if (!r) return areaText(f) ? [areaText(f)] : [];
  const monthly = r.monthly[1] === 0 ? "월세 없음 (전세형)" : `월세 ${rangeMan(r.monthly)} 원`;
  return [`보증금 ${rangeMan(r.deposit)} 원`, monthly, areaText(f), // 낮은 구간의 이름(수급자·1순위…)을 그대로 적으면 이 공고의 대상이 아닌 계층을 부르게 되고 줄도 길다
    r.lowerTier ? "소득 구간에 따라 더 낮을 수 있어요" : ""].filter(Boolean).slice(0, 4);
}

export function whoLines(f: SocialFacts): string[] {
  const L = f.limits;
  const age = L.age === "varies" || !L.age ? null : `${L.age.for ? `${L.age.for} ` : ""}만 ${L.age.value[0]}~${L.age.value[1]}세`;
  const income = L.income1 === "varies" ? "소득 기준은 유형마다 달라요" : L.income1 ? `1인 가구 월소득 ${limitMan(L.income1.value)} 원 이하` : null;
  const asset = L.asset === "varies" ? "자산 기준은 유형마다 달라요" : L.asset ? `총자산 ${limitMan(L.asset.value)} 원 이하` : null;
  const car = L.car && L.car !== "varies" ? `자동차 ${limitMan(L.car.value)} 원 이하` : null;
  const homeless = f.criteria.homeless ? "무주택 세대구성원" : null;
  return [age, income, asset, homeless, car].filter((x): x is string => !!x).slice(0, 4);
}

/**
 * 갈리는 지점을 **숫자로**. "맞벌이는 기준이 따로 있어요"만 말하면 궁금하게만 만든다 —
 * 2인 가구 외벌이·맞벌이 상한을 둘 다 적으면 그 자체로 쓸모 있는 정보다. 숫자가 없으면 사실 한 줄.
 */
export function splitLines(f: SocialFacts): string[] | null {
  const s1 = f.limits.income2single;
  const s2 = f.limits.income2dual;
  if (s1 && s2 && s1 !== "varies" && s2 !== "varies") {
    return ["맞벌이는 소득 기준이 달라요", `2인 가구 외벌이 ${limitMan(s1.value)} 원 이하`, `2인 가구 맞벌이 ${limitMan(s2.value)} 원 이하`];
  }
  const split = f.splits[0]?.value;
  return split ? ["여기서 갈려요", split] : null;
}

export function templateScript(f: SocialFacts, type: ContentType, opts: ScriptOptions = {}): ReelScript {
  const today = opts.today ?? new Date();
  const who = headlineTarget(f);
  const title = [f.region, f.district, who, f.kind].filter(Boolean).join(" ");
  const left = daysLeft(f.apply.end, today);
  const facts = [supplyText(f), type === "deadline" && left !== null ? (left === 0 ? "오늘 접수 마감" : `접수 마감 D-${left} (${md(f.apply.end)})`) : applyText(f)].filter(Boolean);

  // 앞 12초는 공고 사실만. 앱 안내는 마지막 장면 하나에만 둔다 (광고처럼 보이지 않게)
  const scenes: ReelScript["scenes"] = [];
  let t = 0;
  const push = (kind: ReelScript["scenes"][number]["kind"], lines: string[], secs: number) => {
    if (lines.length === 0) return;
    scenes.push({ at: [t, t + secs], kind, lines });
    t += secs;
  };
  const split = splitLines(f);
  push("hook", [title, facts.join(" · ")].filter(Boolean), 2.5);
  // 조건주의 편은 갈리는 지점이 주인공이라 바로 뒤에 둔다
  if (type === "caution" && split) push("split", split, 3);
  push("price", priceLines(f), 3);
  push("who", whoLines(f), 3.5);
  if (type !== "caution" && split) push("split", split, 2.5);
  push("cta", ["내 조건에 맞는지는", "앱에서 바로 확인"], 3);

  const r = f.rent?.value;
  const bullets = [
    [supplyText(f), applyText(f)].filter(Boolean).join(" · "),
    r ? `보증금 ${rangeMan(r.deposit)} 원 · ${r.monthly[1] === 0 ? "월세 없음" : `월세 ${rangeMan(r.monthly)} 원`}` : "",
    ...whoLines(f),
    f.targets.length ? `${f.targets.map((x) => (x.value === "일반" ? "일반공급" : x.value)).join("·")} 신청 대상` : "",
    f.winnerAnnounce ? `당첨자 발표 ${md(f.winnerAnnounce)}` : "",
  ].filter(Boolean);

  const caption = [
    `${title} ${type === "deadline" ? "접수 마감 임박" : "신규 공고"}`,
    "",
    ...bullets.map((b) => `• ${b}`),
    ...(split && split.length > 2 ? ["", `${split[0]} — ${split.slice(1).join(", ")}`] : split ? ["", split.slice(1).join(" ")] : []),
    "",
    "공고 조건은 가구 상황에 따라 달라질 수 있어요. 신청 전에 공고문을 꼭 확인해 주세요.",
    opts.appLink ? "내 조건으로 되는지는 앱에서 확인할 수 있어요 → 프로필 링크" : "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();

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
  if (splitLines(f)) out.push("caution");
  return out;
}
