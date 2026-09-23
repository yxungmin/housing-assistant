/**
 * 영상 브랜드. 색은 앱 토큰을 그대로 가져온다 — 앱과 인스타가 다른 초록을 쓰면 같은 서비스로 안 보인다.
 * (apps/mobile/src/theme/tokens.ts는 의존성 없는 순수 TS라 여기서 바로 읽을 수 있다.)
 */
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { light } from "../../mobile/src/theme/tokens";

export const colors = light;

export const FONT = "Pretendard";
for (const [weight, file] of [["500", "Medium"], ["600", "SemiBold"], ["700", "Bold"], ["800", "ExtraBold"]] as const) {
  void loadFont({ family: FONT, url: staticFile(`fonts/Pretendard-${file}.otf`), weight });
}

/** 1080×1920 릴스. 인스타 UI가 덮는 곳(위 상단바, 아래 캡션·버튼, 오른쪽 아이콘)을 피한다 */
export const REEL = { width: 1080, height: 1920, fps: 30 } as const;
export const SAFE = { top: 250, bottom: 470, left: 88, right: 150 } as const;

export const APP_NAME = "공공주택 비서";
