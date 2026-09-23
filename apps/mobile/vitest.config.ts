import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * 앱 테스트는 순수 로직만 본다 (화면은 브라우저에서 직접 확인한다).
 * react-native 본체는 Flow 문법이라 vitest가 파싱하지 못하므로 웹 구현으로 바꿔 끼운다.
 *
 * `@/`는 tsconfig의 paths와 같은 자리를 가리킨다. 이게 없으면 `@/`를 쓰는 모듈을
 * 하나라도 거치는 순간 테스트가 "패키지를 찾을 수 없다"로 죽는다 —
 * 테스트를 못 쓰게 하려고 임포트를 피해 다니게 되는 쪽이 더 나쁘다.
 */
export default defineConfig({
  resolve: {
    alias: {
      "react-native": "react-native-web",
      // 네이티브 결제 모듈도 파싱하지 못한다. 대역으로 바꿔 끼우고, 순수 규칙만 테스트한다.
      "react-native-purchases": path.resolve(__dirname, "test/stubs/react-native-purchases.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
