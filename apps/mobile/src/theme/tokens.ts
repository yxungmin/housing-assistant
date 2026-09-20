/**
 * 디자인 토큰 (토스 계열 톤). 두 모드는 토큰 값만 바꾼다. 색은 반드시 토큰으로만 쓴다.
 * 원칙: 면은 배경 대비로만 구분(테두리 없음), 색은 CTA·상태·강조 숫자에만, 제목과 숫자는 크게.
 */
export interface Colors {
  primary: string; primarySoft: string; onPrimary: string;
  surface: string; card: string; cardSoft: string; line: string;
  text: string; text2: string; text3: string;
  warning: string; warningSoft: string; danger: string; dangerSoft: string; ok: string; okSoft: string;
  dim: string; tabBar: string;
}

export const light: Colors = {
  primary: "#0AA45A",
  primarySoft: "#E8F7EE",
  onPrimary: "#FFFFFF",
  surface: "#F9FAFB",
  card: "#FFFFFF",
  cardSoft: "#F2F4F6",
  line: "#F2F4F6",
  text: "#191F28",
  text2: "#4E5968",
  text3: "#8B95A1",
  warning: "#D9822B",
  warningSoft: "#FFF4E5",
  danger: "#E5484D",
  dangerSoft: "#FDECEC",
  ok: "#0AA45A",
  okSoft: "#E8F7EE",
  dim: "rgba(23, 27, 31, 0.5)",
  tabBar: "#FFFFFF",
};

export const dark: Colors = {
  primary: "#2ED27C",
  primarySoft: "#123A24",
  onPrimary: "#08150D",
  surface: "#101418",
  card: "#17191D",
  cardSoft: "#22262B",
  line: "#22262B",
  text: "#F2F4F6",
  text2: "#B0B8C1",
  text3: "#7C8590",
  warning: "#F0A24A",
  warningSoft: "#3A2A14",
  danger: "#F06A6E",
  dangerSoft: "#3D1E20",
  ok: "#2ED27C",
  okSoft: "#123A24",
  dim: "rgba(0,0,0,0.65)",
  tabBar: "#17191D",
};

/** 간격: 화면 좌우 24, 카드 안 20, 섹션 사이 28 */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, screen: 24, section: 28, xxl: 36 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 } as const;

export const fonts = {
  regular: "Pretendard-Regular",
  medium: "Pretendard-Medium",
  semiBold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  extraBold: "Pretendard-ExtraBold",
  num: "Pretendard-Bold",
  numMedium: "Pretendard-SemiBold",
} as const;

/** 타입 스케일 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 36, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  subheading: { fontFamily: fonts.semiBold, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 18 },
} as const;
