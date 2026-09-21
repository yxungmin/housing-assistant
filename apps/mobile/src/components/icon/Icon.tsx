import Svg, { Circle, Path, Rect } from "react-native-svg";
import { ICONS, ICON_SIZE, ICON_STROKE_WIDTH, type IconName } from "./icons";
import { useTheme } from "@/theme/ThemeProvider";

export type { IconName };

interface Props {
  name: IconName;
  size?: number;
  /** 골격·테두리 색 */
  color: string;
  /** 안에 든 내용 색. 기본은 브랜드 초록 */
  accent?: string;
  /** 한 가지 색으로만 그린다. 색 자체가 의미인 자리(경고 주황·위험 빨강)에서 켠다 */
  mono?: boolean;
  strokeWidth?: number;
}

/**
 * 선 아이콘. 도형은 `icons.ts`에 데이터로 있고 여기서는 그리기만 한다 —
 * 미리보기 페이지(`scripts/icon-preview.ts`)가 같은 데이터를 쓰므로
 * 눈으로 확인한 모양과 앱에 나가는 모양이 갈리지 않는다.
 *
 * 두 가지 색을 쓴다: 골격은 `color`, 안에 든 내용은 `accent`(기본 브랜드 초록).
 * 다만 색 자체가 의미인 자리에서는 `mono`로 한 가지 색만 쓴다 —
 * 거기서 초록을 섞으면 "빨간 ×인데 속은 초록"이 되어 의미가 흐려진다.
 */
export function Icon({ name, size = ICON_SIZE, color, accent, mono, strokeWidth = ICON_STROKE_WIDTH }: Props) {
  const { colors } = useTheme();
  const tone = mono ? color : (accent ?? colors.primary);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ICONS[name].map((s, i) => {
        const stroke = (s.tone ?? "line") === "accent" ? tone : color;
        const paint = s.fill
          ? { fill: stroke, stroke: "none" }
          : { fill: "none", stroke, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
        if (s.k === "path") return <Path key={i} d={s.d} {...paint} />;
        if (s.k === "circle") return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
        return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} {...paint} />;
      })}
    </Svg>
  );
}
