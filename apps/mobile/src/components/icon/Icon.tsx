import { SvgAst, parse, type JsxAST } from "react-native-svg";
import { ICON_SIZE, isAssetIcon, svgFor, type IconName } from "./icons";
import { useTheme } from "@/theme/ThemeProvider";

export type { IconName };

interface Props {
  name: IconName;
  size?: number;
  /**
   * 선 아이콘(MONO)의 색. 안 주면 본문 색이다.
   * 그림 아이콘(ASSET)에는 듣지 않는다 — 색이 그림에 박혀 있다 (`icons.ts` 참고).
   */
  color?: string;
}

/**
 * 아이콘 하나. 도형은 `icons.ts`에 SVG 문자열로 있고 여기서는 그리기만 한다 —
 * 미리보기 페이지(`scripts/icon-preview.ts`)가 같은 문자열을 쓰므로
 * 눈으로 확인한 모양과 앱에 나가는 모양이 갈리지 않는다.
 *
 * 파싱은 앱이 도는 동안 아이콘 한 종류당 한 번만 한다. `SvgXml`을 그대로 쓰면
 * 파싱 결과가 컴포넌트마다 따로 캐시돼서, 같은 화살표가 목록에 서른 개 있으면 서른 번 파싱된다.
 */
const cache = new Map<IconName, JsxAST | null>();

function astFor(name: IconName): JsxAST | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const ast = parse(svgFor(name));
  cache.set(name, ast);
  return ast;
}

export function Icon({ name, size = ICON_SIZE, color }: Props) {
  const { colors } = useTheme();
  const ast = astFor(name);
  if (!ast) return null;
  return (
    <SvgAst
      ast={ast}
      override={{
        width: size,
        height: size,
        // 그림 아이콘은 색을 넘기지 않는다. 넘기면 팔레트 중 currentColor로 둔 자리가 물든다.
        ...(isAssetIcon(name) ? {} : { color: color ?? colors.text }),
      }}
    />
  );
}
