/**
 * 릴스 한 편. collector/src/social의 대본 JSON(social/output/<id>.<type>.json)을 그대로 props로 받는다.
 *
 * 화면은 매번 새로 만들지 않는다 — 장면 종류(hook·place·checks·split·cta)마다 틀이 정해져 있고
 * 대본은 글자만 채운다. 브랜드가 한결같아야 알림 계정으로 기억된다.
 * 대본은 이미 재대조(verify.ts)를 통과한 것만 렌더한다(scripts/render.ts). 여기서는 글자를 바꾸지 않는다.
 */
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { APP_NAME, colors, FONT, SAFE } from "./brand";

export interface Scene {
  at: [number, number];
  kind: "hook" | "place" | "checks" | "split" | "cta";
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

const BADGE: Record<ReelProps["type"], { bg: string; fg: string }> = {
  new: { bg: colors.primary, fg: colors.onPrimary },
  deadline: { bg: colors.danger, fg: "#FFFFFF" },
  caution: { bg: colors.warning, fg: "#FFFFFF" },
};

/** 들어오는 움직임. 모든 장면이 같은 움직임을 쓴다 */
function useEnter(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 14 });
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px)` };
}

function Brand({ type, badge }: { type: ReelProps["type"]; badge: string }) {
  const b = BADGE[type];
  return (
    <div style={{ position: "absolute", top: SAFE.top - 90, left: SAFE.left, right: SAFE.right, display: "flex", alignItems: "center", gap: 18 }}>
      <Img src={staticFile("logo.png")} style={{ width: 64, height: 64 }} />
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, color: colors.text, letterSpacing: -1, flex: 1 }}>{APP_NAME}</div>
      <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 32, color: b.fg, background: b.bg, borderRadius: 999, padding: "10px 26px", letterSpacing: -0.5 }}>{badge}</div>
    </div>
  );
}

/*
 * 줄바꿈: 한국어는 단어(띄어쓰기) 단위로만 끊고(keep-all), 큰 글자는 줄 길이를 고르게 맞춘다(balance).
 * 안 그러면 "신혼부부라고 다 되는 / 건 아니에요"처럼 짧은 꼬리 한 줄이 남는다.
 */
const Body = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "absolute", top: SAFE.top + 40, bottom: SAFE.bottom, left: SAFE.left, right: SAFE.right, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36, wordBreak: "keep-all", textWrap: "balance" }}>
    {children}
  </div>
);

function Hook({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  const b = useEnter(5);
  return (
    <Body>
      <div style={{ ...a, fontFamily: FONT, fontWeight: 700, fontSize: 60, color: colors.text2, letterSpacing: -1.5 }}>{lines[0]}</div>
      <div style={{ ...b, fontFamily: FONT, fontWeight: 800, fontSize: 104, lineHeight: 1.18, color: colors.text, letterSpacing: -4, whiteSpace: "pre-line" }}>{lines.slice(1).join("\n")}</div>
    </Body>
  );
}

function Place({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  return (
    <Body>
      <div style={{ ...a, background: colors.card, borderRadius: 48, padding: "64px 60px", display: "flex", flexDirection: "column", gap: 34 }}>
        {lines.map((l, i) => (
          <div key={l} style={{ fontFamily: FONT, fontWeight: i === 0 ? 800 : 700, fontSize: i === 0 ? 84 : 68, color: i === 0 ? colors.text : colors.text2, letterSpacing: -2.5 }}>
            {l}
          </div>
        ))}
      </div>
    </Body>
  );
}

/** "✓ 청년도 신청 대상" / "△ 소득 기준 있음" — 기호는 그림으로 그린다. 글리프는 폰트마다 모양이 다르다 */
function CheckRow({ line, delay }: { line: string; delay: number }) {
  const s = useEnter(delay);
  const maybe = line.startsWith("△");
  const text = line.replace(/^[✓△]\s*/, "");
  const tone = maybe ? { bg: colors.warningSoft, fg: colors.warning } : { bg: colors.primarySoft, fg: colors.primary };
  return (
    <div style={{ ...s, display: "flex", alignItems: "center", gap: 32 }}>
      <div style={{ width: 96, height: 96, borderRadius: 48, background: tone.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
          {maybe ? (
            <path d="M12 5 20 19H4L12 5Z" stroke={tone.fg} strokeWidth="2.6" strokeLinejoin="round" />
          ) : (
            <path d="M5.5 12.5 10 17 18.5 7.5" stroke={tone.fg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 66, color: colors.text, letterSpacing: -2.5 }}>{text}</div>
    </div>
  );
}

function Checks({ lines }: { lines: string[] }) {
  return (
    <Body>
      {lines.map((l, i) => (
        <CheckRow key={l} line={l} delay={i * 6} />
      ))}
    </Body>
  );
}

function Split({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  const b = useEnter(6);
  return (
    <Body>
      <div style={{ ...a, fontFamily: FONT, fontWeight: 700, fontSize: 60, color: colors.text3, letterSpacing: -1.5 }}>{lines[0]}</div>
      <div style={{ ...b, background: colors.primarySoft, borderRadius: 48, padding: "60px 56px", fontFamily: FONT, fontWeight: 800, fontSize: 88, lineHeight: 1.22, color: colors.primaryPressed, letterSpacing: -3, whiteSpace: "pre-line" }}>
        {lines.slice(1).join("\n")}
      </div>
    </Body>
  );
}

function Cta({ lines }: { lines: string[] }) {
  const a = useEnter(0);
  const b = useEnter(6);
  return (
    <Body>
      <div style={{ ...a, display: "flex", justifyContent: "center" }}>
        <Img src={staticFile("logo.png")} style={{ width: 260, height: 260 }} />
      </div>
      <div style={{ ...b, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 92, lineHeight: 1.2, color: colors.text, letterSpacing: -3.5, whiteSpace: "pre-line" }}>
        {lines.join("\n")}
      </div>
      <div style={{ ...b, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 44, color: colors.primary, letterSpacing: -1 }}>{APP_NAME}</div>
    </Body>
  );
}

const SCENES = { hook: Hook, place: Place, checks: Checks, split: Split, cta: Cta };

export function Reel(props: ReelProps) {
  const { fps } = useVideoConfig();
  const scenes = props.script.scenes;
  const badge = props.type === "deadline" ? (scenes[0]?.lines[1]?.match(/D-\d+|오늘/)?.[0] ?? "마감 임박") : props.type === "caution" ? "조건 주의" : "NEW";
  return (
    <AbsoluteFill style={{ background: colors.surface }}>
      <Brand type={props.type} badge={badge} />
      {scenes.map((s, i) => {
        const Comp = SCENES[s.kind];
        const from = Math.round(s.at[0] * fps);
        // 마지막 장면은 꼬리까지 이어서 보여 준다
        const until = i === scenes.length - 1 ? s.at[1] + TAIL_SECONDS : s.at[1];
        return (
          <Sequence key={`${s.kind}-${i}`} from={from} durationInFrames={Math.round((until - s.at[0]) * fps)} layout="none">
            <Comp lines={s.lines} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
