/**
 * 아이콘은 이 한 곳으로만 들어온다: `import { Icon } from "@/components/icon"`.
 *
 * 도형 데이터(`icons.ts`)와 그리는 쪽(`Icon.tsx`)을 갈라 둔 이유가 하나다 —
 * 미리보기 페이지(`scripts/icon-preview.ts`)가 같은 데이터를 읽어 HTML로 그린다.
 * 눈으로 확인한 모양과 앱에 나가는 모양이 갈릴 자리를 없앴다.
 */
export { Icon } from "./Icon";
export { ICONS, ICON_NAMES, ICON_SIZE, ICON_STROKE_WIDTH } from "./icons";
export type { IconName, Shape } from "./icons";
