/**
 * 디자인 토큰. design/screens-mockup.html 과 같은 값. 두 모드는 토큰 값만 바꾼다.
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

/** 폰트 패밀리 이름 (expo-font 로드 이름과 일치) */
export const fonts = {
  regular: "GothicA1_400Regular",
  medium: "GothicA1_500Medium",
  bold: "GothicA1_700Bold",
  extraBold: "GothicA1_800ExtraBold",
  num: "Manrope_700Bold",
  numMedium: "Manrope_600SemiBold",
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
} as const;
