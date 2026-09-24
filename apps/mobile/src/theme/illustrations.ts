/**
 * 빈 화면 그림. 라이트·다크 한 쌍씩.
 *
 * 파일은 `apps/mobile/assets/illustrations/<이름>.png`, `<이름>-dark.png` — 있으면 아래 표에 넣는다.
 * Metro는 require를 빌드 때 푸니 없는 파일을 가리킬 수 없다. 그래서 표가 비어 있으면 EmptyState는 아이콘으로 돈다.
 *
 * 그림 규격 (2026-09-24 합의): 3:2(1200×800), 배경 투명 PNG, 글자 없음, 200px 폭에서도 읽히는 단순한 실루엣,
 * 색은 앱 토큰 — 초록 #2ED27C·#17B66B·연초록 #DDF8EA, 회색 #E5E8EB·#F2F4F6·#B0B8C1. 다크는 연초록 대신 #123A24, 흰 면은 #191F28 계열.
 */
import type { ImageSourcePropType } from "react-native";
import { useTheme } from "./ThemeProvider";

export type IllustrationName = "saved" | "alerts" | "home";

const ILLUSTRATIONS: Partial<Record<IllustrationName, { light: ImageSourcePropType; dark: ImageSourcePropType }>> = {
  // saved: { light: require("../../assets/illustrations/saved.png"), dark: require("../../assets/illustrations/saved-dark.png") },
  // alerts: { light: require("../../assets/illustrations/alerts.png"), dark: require("../../assets/illustrations/alerts-dark.png") },
  // home: { light: require("../../assets/illustrations/home.png"), dark: require("../../assets/illustrations/home-dark.png") },
};

/** 지금 테마에 맞는 그림. 없으면 undefined — EmptyState가 아이콘으로 돈다 */
export function useIllustration(name: IllustrationName): ImageSourcePropType | undefined {
  const { scheme } = useTheme();
  const pair = ILLUSTRATIONS[name];
  return pair ? (scheme === "dark" ? pair.dark : pair.light) : undefined;
}
