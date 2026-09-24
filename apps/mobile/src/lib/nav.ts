import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

/**
 * 뒤로 가기 — 돌아갈 곳이 없으면 홈으로.
 *
 * 알림·딥링크로 상세 화면에 바로 들어오면 스택에 그 화면 하나뿐이다. 그때 맨 `router.back()`은
 * 아무 일도 안 하고, 안드로이드 하드웨어 백키는 앱을 닫는다 (2026-09-24 감사).
 * 헤더의 뒤로는 전부 이걸 쓴다. `dismissTo`는 홈이 스택에 있으면 거기까지 걷어 내고, 없으면 홈으로 바꾼다 —
 * `replace("/(tabs)")`처럼 홈을 하나 더 쌓지 않는다.
 */
export function goBackOrHome(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.dismissTo("/(tabs)");
}
