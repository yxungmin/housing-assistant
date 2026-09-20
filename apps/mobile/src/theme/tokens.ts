/**
 * 디자인 토큰. design/screens-mockup.html 과 같은 색. 두 모드는 토큰 값만 바꾼다.
 * 색은 반드시 토큰으로만 쓴다 (문서: 디자인 원칙).
 */
export interface Colors {
  primary: string; primarySoft: string; onPrimary: string; surface: string; card: string; text: string; text2: string; border: string;
  warning: string; warningSoft: string; danger: string; dangerSoft: string; ok: string; dim: string;
}

export const light: Colors = {
  primary: "#0a9e52",
  primarySoft: "#e4f5ea",
  onPrimary: "#ffffff",
  surface: "#f5f7f4",
  card: "#ffffff",
  text: "#151d18",
  text2: "#5d6a63",
  border: "#e2e8e3",
  warning: "#c77a0c",
  warningSoft: "#fbf0dc",
  danger: "#cf3d3d",
  dangerSoft: "#fbe6e6",
  ok: "#0a9e52",
  dim: "rgba(8,16,11,0.45)",
};

export const dark: Colors = {
  primary: "#2fc274",
  primarySoft: "#14331f",
  onPrimary: "#06140c",
  surface: "#0f1411",
  card: "#171d19",
  text: "#eaf0ec",
  text2: "#93a198",
  border: "#27312b",
  warning: "#e8a53a",
  warningSoft: "#33270f",
  danger: "#ef6b6b",
  dangerSoft: "#3a1717",
  ok: "#2fc274",
  dim: "rgba(0,0,0,0.6)",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/**
 * 폰트: Pretendard (OFL, npm `pretendard`의 정적 otf를 번들). 이름은 app/_layout.tsx의 useFonts 키와 일치.
 * 숫자도 Pretendard로 통일하고 fontVariant tabular-nums로 폭을 맞춘다.
 */
export const fonts = {
  regular: "Pretendard-Regular",
  medium: "Pretendard-Medium",
  semiBold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  extraBold: "Pretendard-ExtraBold",
  num: "Pretendard-Bold",
  numMedium: "Pretendard-SemiBold",
} as const;

/** 타입 스케일. 제목·큰 숫자는 한 화면 한 메시지가 읽히도록 크게. */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 34, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 16 },
} as const;
