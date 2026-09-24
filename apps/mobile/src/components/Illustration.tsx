import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * 빈 화면 그림 세 장. PNG가 아니라 코드로 그린다 —
 *  - 색이 테마 토큰에서 오니 라이트·다크가 따로 필요 없고 배경 투명 문제도 없다
 *  - 어느 크기에서도 선명하고, 번들에 그림 파일이 안 붙는다
 *  - 아이콘(icons.ts)과 같은 팔레트라 화면 안에서 튀지 않는다
 * 구도는 GPT로 시안을 뽑아 본 것(2026-09-24)을 따랐다: 돋보기 아래 집 셋 / 조용한 종과 달력 / 집 카드 옆 빈 책갈피.
 * 뷰박스는 300×200(3:2). 도형은 둥근 기하 도형만, 외곽선·글자 없음.
 */
export type IllustrationName = "home" | "alerts" | "saved";

export function Illustration({ name, width = 220 }: { name: IllustrationName; width?: number }) {
  const { colors } = useTheme();
  const height = Math.round((width * 2) / 3);
  const c = {
    green: colors.primary,
    greenDeep: colors.primaryPressed,
    greenSoft: colors.primarySoft,
    gray: colors.cardStrong,
    graySoft: colors.cardSoft,
    grayDeep: colors.text4,
    ink: colors.text3,
    paper: colors.surface,
  };
  const props = { width, height, viewBox: "0 0 300 200", accessibilityRole: "image" as const };

  if (name === "home") {
    // 집 세 채, 가운데만 켜졌다. 돋보기가 그 집 위에.
    const house = (x: number, roof: string, body: string, win: string) => (
      <>
        <Path d={`M${x - 32} 96 L${x} 66 L${x + 32} 96 Q${x + 34} 100 ${x + 29} 101 L${x - 29} 101 Q${x - 34} 100 ${x - 32} 96 Z`} fill={roof} />
        <Rect x={x - 26} y={100} width={52} height={44} rx={7} fill={body} />
        <Rect x={x - 8} y={112} width={16} height={16} rx={4} fill={win} />
      </>
    );
    return (
      <Svg {...props}>
        {house(72, c.gray, c.gray, c.grayDeep)}
        {house(228, c.gray, c.gray, c.grayDeep)}
        {house(150, c.green, c.greenSoft, c.grayDeep)}
        <Circle cx={150} cy={104} r={58} stroke={c.grayDeep} strokeWidth={11} fill="none" />
        <Line x1={192} y1={146} x2={222} y2={176} stroke={c.grayDeep} strokeWidth={13} strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === "alerts") {
    // 소리 없는 종 하나, 옆에 작은 달력. 움직임 선은 없다 — 조용하다는 뜻이다.
    return (
      <Svg {...props}>
        <Rect x={118} y={40} width={20} height={20} rx={10} fill={c.greenSoft} />
        <Path d="M128 52 C96 52 82 80 82 112 L82 128 Q76 138 66 146 Q62 150 68 150 L188 150 Q194 150 190 146 Q180 138 174 128 L174 112 C174 80 160 52 128 52 Z" fill={c.greenSoft} />
        <Path d="M108 152 Q128 176 148 152 Z" fill={c.green} />
        <Rect x={168} y={94} width={80} height={72} rx={12} fill={c.paper} stroke={c.gray} strokeWidth={2} />
        <Path d="M168 106 Q168 94 180 94 L236 94 Q248 94 248 106 L248 118 L168 118 Z" fill={c.green} />
        <Rect x={184} y={86} width={7} height={18} rx={3.5} fill={c.gray} />
        <Rect x={225} y={86} width={7} height={18} rx={3.5} fill={c.gray} />
        <Circle cx={185} cy={133} r={6} fill={c.gray} />
        <Circle cx={208} cy={133} r={6} fill={c.gray} />
        <Circle cx={231} cy={133} r={6} fill={c.green} />
        <Circle cx={185} cy={152} r={6} fill={c.gray} />
        <Circle cx={208} cy={152} r={6} fill={c.gray} />
        <Circle cx={231} cy={152} r={6} fill={c.gray} />
      </Svg>
    );
  }

  // saved: 집 카드 하나와 그 옆에 아직 비어 있는 책갈피.
  return (
    <Svg {...props}>
      <Rect x={68} y={54} width={116} height={102} rx={14} fill={c.paper} stroke={c.gray} strokeWidth={2} />
      <Path d="M92 96 L126 68 L160 96 Q162 100 157 101 L95 101 Q90 100 92 96 Z" fill={c.green} />
      <Rect x={98} y={100} width={56} height={36} rx={6} fill={c.greenSoft} />
      <Rect x={118} y={114} width={16} height={22} rx={3} fill={c.grayDeep} />
      <Rect x={84} y={144} width={62} height={7} rx={3.5} fill={c.gray} />
      <Path d="M196 78 L246 78 Q252 78 252 84 L252 156 L221 134 L190 156 L190 84 Q190 78 196 78 Z" fill={c.grayDeep} />
      <Line x1={226} y1={56} x2={228} y2={44} stroke={c.greenSoft} strokeWidth={5} strokeLinecap="round" />
      <Line x1={244} y1={64} x2={252} y2={56} stroke={c.greenSoft} strokeWidth={5} strokeLinecap="round" />
      <Line x1={254} y1={82} x2={266} y2={80} stroke={c.greenSoft} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}
