/**
 * 릴스 한 편. collector/src/social의 대본 JSON(social/output/<id>.<type>.json)을 그대로 props로 받는다.
 *
 * 앞 12초는 **공고 사실만** — 무슨 공고인지(hook), 얼마인지(price), 누가 되는지(who), 어디서 갈리는지(split).
 * 로고와 앱 이름은 마지막 장면(cta)에만 나온다. 전에는 모든 장면 위에 로고와 앱 이름이 붙어 있어서
 * 공고 알림이 아니라 앱 광고처럼 보였다(2026-09-23).
 *
 * 화면은 매번 새로 만들지 않는다 — 장면 종류마다 틀이 정해져 있고 대본은 글자만 채운다.
 * 대본은 이미 재대조(verify.ts)를 통과한 것만 렌더한다(scripts/render.ts). 여기서는 글자를 바꾸지 않는다.
 */
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { APP_NAME, colors, FONT, SAFE } from "./brand";

export interface Scene {
  at: [number, number];
  kind: "hook" | "price" | "who" | "split" | "cta";
  lines: string[];
}

// Remotion은 props가 Record<string, unknown>에 들어가야 받는다 — interface가 아니라 type으로 둔다
export type ReelProps = {
  id: string;
  type: "new" | "deadline" | "caution";
  script: { type: "new" | "deadline" | "caution"; scenes: Scene[] };
};

/** 마지막 장면 뒤에 잠깐 머문다 — 바로 끊기면 CTA를 읽기 전에 다음 릴스로 넘어간다 */
export const TAIL_SECONDS = 1;

export const reelDuration = (p: ReelProps, fps: number) => Math.ceil(((p.script.scenes.at(-1)?.at[1] ?? 10) + TAIL_SECONDS) * fps);

const WIDTH = 1080 - SAFE.left - SAFE.right;

/**
 * 한 줄에 들어가게 글자 크기를 줄인다. 공고마다 금액 길이가 달라("200만" / "9,066만~2억 3,313만")
 * 고정 크기로 두면 긴 줄이 두 줄로 꺾여 카드가 넘친다. 한글은 1em, 숫자·기호는 좁게 셈한다.
 */
function fit(line: string, base: number, width = WIDTH - 20): number {
  let em = 0;
  for (const ch of line) em += /[가-힣]/.test(ch) ? 0.96 : /\s/.test(ch) ? 0.28 : /[0-9]/.test(ch) ? 0.58 : 0.5;
  return Math.min(base, Math.floor(width / Math.max(em, 1)));
}

const BADGE: Record<ReelProps["type"], { bg: string; fg: string }> = {
  new: { bg: colors.primarySoft, fg: colors.primaryPressed },
  deadline: { bg: colors.dangerSoft, fg: colors.danger },
  caution: { bg: colors.warningSoft, fg: colors.warning },
};

/** 들어오는 움직임. 모든 장면이 같은 움직임을 쓴다 */
function useEnter(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 14 });
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px)` };
}

/* 줄바꿈: 한국어는 단어(띄어쓰기) 단위로만 끊고(keep-all), 큰 글자는 줄 길이를 고르게 맞춘다(balance). */
const Body = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "absolute", top: SAFE.top, bottom: SAFE.bottom, left: SAFE.left, right: SAFE.right, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, wordBreak: "keep-all", textWrap: "balance" }}>
    {children}
  </div>
);

const type = (size: number, weight: number, color: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontFamily: FONT,
  fontWeight: weight,
  fontSize: size,
  color,
  letterSpacing: -size * 0.035,
  lineHeight: 1.22,
  ...extra,
});

function Hook({ lines, kind, badge }: { lines: string[]; kind: ReelProps["type"]; badge: string }) {
  const a = useEnter(0);
  const b = useEnter(4);
  const c = useEnter(8);
  const tone = BADGE[kind];
  return (
    <Body>
      <div style={{ ...a, alignSelf: "flex-start", ...type(40, 800, tone.fg), background: tone.bg, borderRadius: 999, padding: "12px 30px" }}>{badge}</div>
      <div style={{ ...b, ...type(fit(lines[0] ?? "", 104), 800, colors.text) }}>{lines[0]}</div>
      {lines[1] ? <div style={{ ...c, ...type(fit(lines[1], 60), 700, colors.text2) }}>{lines[1]}</div> : null}
    </Body>
  );
}

/** 같은 역할의 줄은 같은 크기로 — 줄마다 따로 맞추면 짧은 줄만 커져 위계가 뒤집힌다 */
const shared = (ls: string[], base: number, width: number) => Math.min(...ls.map((l) => fit(l, base, width)), base);

function Price({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  const main = shared(lines.slice(0, 2), 76, WIDTH - 132);
  const sub = shared(lines.slice(2), 52, WIDTH - 132);
  return (
    <Body>
      <div style={{ ...a, background: colors.card, borderRadius: 48, padding: "60px 56px", display: "flex", flexDirection: "column", gap: 28 }}>
        {lines.map((l, i) => (
          // 보증금·월세가 주인공이다. 면적과 구간 안내는 작게
          <div key={l} style={type(i < 2 ? main : sub, i < 2 ? 800 : 600, i < 2 ? colors.text : colors.text2)}>
            {l}
          </div>
        ))}
      </div>
    </Body>
  );
}

/** 기준 한 줄. 판정(✓/✕)이 아니라 공고 사실이라 중립 표시(점)를 쓴다 */
function WhoRow({ line, delay, size }: { line: string; delay: number; size: number }) {
  const s = useEnter(delay);
  const vague = /달라요$/.test(line);
  return (
    <div style={{ ...s, display: "flex", alignItems: "center", gap: 28 }}>
      <div style={{ width: 20, height: 20, borderRadius: 10, background: vague ? colors.text4 : colors.primary, flexShrink: 0 }} />
      <div style={type(size, 700, vague ? colors.text2 : colors.text)}>{line}</div>
    </div>
  );
}

function Who({ lines }: { lines: string[] }) {
  const size = shared(lines, 68, WIDTH - 48);
  return (
    <Body>
      {lines.map((l, i) => (
        <WhoRow key={l} line={l} delay={i * 5} size={size} />
      ))}
    </Body>
  );
}

function Split({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  const b = useEnter(6);
  const [head, ...rest] = lines;
  const size = shared(rest, 70, WIDTH - 124);
  return (
    <Body>
      <div style={{ ...a, ...type(fit(head ?? "", 64), 800, colors.text) }}>{head}</div>
      <div style={{ ...b, background: colors.primarySoft, borderRadius: 48, padding: "56px 52px", display: "flex", flexDirection: "column", gap: 24 }}>
        {rest.map((l) => (
          <div key={l} style={type(size, 800, colors.primaryPressed)}>
            {l}
          </div>
        ))}
      </div>
    </Body>
  );
}

/** 앱 이야기는 여기 한 번뿐 */
function Cta({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  const b = useEnter(6);
  return (
    <Body>
      <div style={{ ...a, display: "flex", justifyContent: "center" }}>
        <Img src={staticFile("logo.png")} style={{ width: 240, height: 240 }} />
      </div>
      <div style={{ ...b, ...type(88, 800, colors.text, { textAlign: "center", whiteSpace: "pre-line" }) }}>{lines.join("\n")}</div>
      <div style={{ ...b, ...type(44, 700, colors.primary, { textAlign: "center" }) }}>{APP_NAME}</div>
    </Body>
  );
}

export function Reel(props: ReelProps) {
  const { fps } = useVideoConfig();
  const scenes = props.script.scenes;
  const deadline = scenes[0]?.lines[1]?.match(/D-\d+|오늘 접수 마감/)?.[0];
  const badge = props.type === "deadline" ? (deadline === "오늘 접수 마감" ? "오늘 마감" : `마감 ${deadline ?? "임박"}`) : props.type === "caution" ? "조건 주의" : "신규 공고";
  return (
    <AbsoluteFill style={{ background: colors.surface }}>
      {scenes.map((s, i) => {
        const from = Math.round(s.at[0] * fps);
        // 마지막 장면은 꼬리까지 이어서 보여 준다
        const until = i === scenes.length - 1 ? s.at[1] + TAIL_SECONDS : s.at[1];
        const body =
          s.kind === "hook" ? <Hook lines={s.lines} kind={props.type} badge={badge} />
          : s.kind === "price" ? <Price lines={s.lines} />
          : s.kind === "who" ? <Who lines={s.lines} />
          : s.kind === "split" ? <Split lines={s.lines} />
          : <Cta lines={s.lines} />;
        return (
          <Sequence key={`${s.kind}-${i}`} from={from} durationInFrames={Math.round((until - s.at[0]) * fps)} layout="none">
            {body}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
