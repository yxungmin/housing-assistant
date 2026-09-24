// ESLint 평면 설정. 규칙은 최소로 둔다 — 잡고 싶은 것은 셋이다:
//  1. 훅 규칙 (react-hooks/rules-of-hooks): 조기 return 뒤의 useState가 2026-09-24 감사에서 P0 크래시였다. 도구가 잡을 일이다.
//  2. 훅 의존성 (exhaustive-deps): 경고만. 의도적으로 뺀 곳이 있다(sync.ts).
//  3. 타입스크립트 기본 (typescript-eslint recommended): 안 쓰는 변수·any 등.
// 서식은 다루지 않는다 (포매터 몫).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/web-build/**", "apps/video/out/**", "apps/mobile/scripts/**", "apps/mobile/plugins/**", "apps/video/scripts/**", "supabase/functions/**", "**/*.config.*", "eslint.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // 밑줄로 시작하면 "일부러 안 쓴다"는 뜻이다 (const { b_code: _bCode, ...rest })
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // `as unknown as`·non-null은 이 코드베이스가 의도적으로 쓴다. 지금은 세지 않는다
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      // 빈 catch는 "실패해도 넘어간다"를 뜻하는 자리다 — 주석이 있으면 된다
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["apps/mobile/**/*.tsx", "apps/mobile/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Expo는 폰트·이미지를 require()로 묶는다 (Metro 자산 시스템)
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
