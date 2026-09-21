/**
 * 아이콘은 이 한 곳으로만 들어온다: `import { Icon } from "@/components/icon"`.
 *
 * 원본(`icons.ts`)과 그리는 쪽(`Icon.tsx`)을 갈라 둔 이유가 하나다 —
 * 미리보기 페이지(`scripts/icon-preview.ts`)가 같은 SVG 문자열을 읽어 HTML로 그린다.
 * 눈으로 확인한 모양과 앱에 나가는 모양이 갈릴 자리를 없앴다.
 */
export { Icon } from "./Icon";
export {
  ASSET_ICON_NAMES,
  ASSET_ICONS,
  ICON_NAMES,
  ICON_SIZE,
  isAssetIcon,
  MONO_ICON_NAMES,
  MONO_ICONS,
  svgFor,
} from "./icons";
export type { AssetIconName, IconName, MonoIconName } from "./icons";
