import { defineConfig } from "vitest/config";

/**
 * 앱 테스트는 순수 로직만 본다 (화면은 브라우저에서 직접 확인한다).
 * react-native 본체는 Flow 문법이라 vitest가 파싱하지 못하므로 웹 구현으로 바꿔 끼운다.
 */
export default defineConfig({
  resolve: { alias: { "react-native": "react-native-web" } },
});
