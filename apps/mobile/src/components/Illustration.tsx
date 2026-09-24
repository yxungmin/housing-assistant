import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
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
        <Path d={`M${x - 32} 96 L${x - 5} 70 Q${x} 65 ${x + 5} 70 L${x + 32} 96 Q${x + 34} 100 ${x + 29} 101 L${x - 29} 101 Q${x - 34} 100 ${x - 32} 96 Z`} fill={roof} />
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
        <Circle cx={128} cy={158} r={10} fill={c.green} />
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

  // saved: 집 카드 하나와 그 오른쪽 모서리에 걸린 빈 책갈피. 카드가 캔버스를 채워야 그림으로 읽힌다 — 처음엔 60%만 써서 아이콘처럼 작았다.
  return (
    <Svg {...props}>
      {/* 카드만 살짝 기울인다 — 정면으로 놓으면 픽토그램이지 그림이 아니다. 책갈피는 바로 세워 기준이 된다 */}
      <G rotation={-4} origin="136, 103">
        <Rect x={52} y={36} width={168} height={134} rx={18} fill={c.paper} stroke={c.gray} strokeWidth={2} />
        <Path d="M86 92 L131 56 Q136 51 141 56 L186 92 Q189 97 183 98 L89 98 Q83 97 86 92 Z" fill={c.green} />
        <Rect x={96} y={97} width={80} height={48} rx={8} fill={c.greenSoft} />
        <Rect x={124} y={115} width={24} height={30} rx={4} fill={c.grayDeep} />
        <Rect x={104} y={110} width={12} height={12} rx={3} fill={c.gray} />
        <Rect x={156} y={110} width={12} height={12} rx={3} fill={c.gray} />
        <Rect x={72} y={152} width={70} height={8} rx={4} fill={c.gray} />
      </G>
      <Path d="M196 62 L246 62 Q254 62 254 70 L254 166 Q254 171 250 168 L225 149 Q221 146 217 149 L192 168 Q188 171 188 166 L188 70 Q188 62 196 62 Z" fill={c.grayDeep} />
      <Path d="M196 62 L246 62 Q254 62 254 70 L254 76 L188 76 L188 70 Q188 62 196 62 Z" fill={c.ink} />
      <Line x1={262} y1={48} x2={268} y2={34} stroke={c.green} strokeWidth={6} strokeLinecap="round" />
      <Line x1={272} y1={66} x2={286} y2={60} stroke={c.green} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  );
}
