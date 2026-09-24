/**
 * 디자인 토큰 — 토스 디자인 시스템(TDS) 회색 단계와 같은 값을 쓴다.
 * grey50 #F9FAFB · grey100 #F2F4F6 · grey200 #E5E8EB · grey400 #B0B8C1 · grey500 #8B95A1 · grey700 #4E5968 · grey900 #191F28
 * 원칙: 흰 화면 + grey50 그룹 카드, 헤어라인 대신 간격, 색은 CTA·상태·강조에만.
 */
export interface Colors {
  primary: string; primarySoft: string; onPrimary: string; primaryPressed: string;
  surface: string; card: string; cardSoft: string; cardStrong: string; line: string;
  text: string; text2: string; text3: string; text4: string;
  warning: string; warningSoft: string; danger: string; dangerSoft: string; ok: string; okSoft: string; info: string; infoSoft: string;
  dim: string; tabBar: string;
}

export const light: Colors = {
  primary: "#0FB25F",
  primaryPressed: "#0C9A52",
  primarySoft: "#E6F8EE",
  onPrimary: "#FFFFFF",
  surface: "#FFFFFF",
  card: "#F9FAFB",
  cardSoft: "#F2F4F6",
  cardStrong: "#E5E8EB",
  line: "#E5E8EB",
  text: "#191F28",
  text2: "#4E5968",
  text3: "#8B95A1",
  text4: "#B0B8C1",
  warning: "#E67A17",
  warningSoft: "#FFF3E6",
  danger: "#F04452",
  dangerSoft: "#FDECEE",
  ok: "#0FB25F",
  okSoft: "#E6F8EE",
  info: "#3182F6",
  infoSoft: "#E8F3FF",
  dim: "rgba(0, 23, 51, 0.55)",
  tabBar: "#FFFFFF",
};

export const dark: Colors = {
  primary: "#2ED27C",
  primaryPressed: "#26BF6F",
  primarySoft: "#123A24",
  onPrimary: "#08150D",
  surface: "#17171C",
  card: "#202027",
  cardSoft: "#2A2A33",
  cardStrong: "#353542",
  line: "#2A2A33",
  text: "#F2F4F6",
  text2: "#B0B8C1",
  text3: "#8B95A1",
  text4: "#6B7684",
  warning: "#F5A044",
  warningSoft: "#3A2A14",
  danger: "#F36C77",
  dangerSoft: "#3D1E22",
  ok: "#2ED27C",
  okSoft: "#123A24",
  info: "#5B9CF8",
  infoSoft: "#1A2C45",
  dim: "rgba(0,0,0,0.7)",
  tabBar: "#17171C",
};

/**
 * 간격: 화면 좌우 20, 카드 안 20, 섹션 사이 32.
 * 좌우는 24였다가 20으로 줄였다(2026-09-24) — 360px 폰에서 숫자·주소 줄이 한 칸씩 더 꺾였고,
 * 20이면 헤더 뒤로 가기 아이콘(12 + 8)과 하단 버튼(xl)의 왼쪽 선이 본문과 한 줄에 선다.
 */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, screen: 20, section: 32, xxl: 40 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 } as const;

export const fonts = {
  regular: "Pretendard-Regular",
  medium: "Pretendard-Medium",
  semiBold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  extraBold: "Pretendard-ExtraBold",
  num: "Pretendard-Bold",
  numMedium: "Pretendard-SemiBold",
} as const;

/** 타입 스케일 (TDS 근사): 제목은 크고 자간을 좁게, 본문 16 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 44, letterSpacing: -1 },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 38, letterSpacing: -0.8 },
  heading: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.5 },
  subheading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, letterSpacing: -0.2 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, letterSpacing: -0.2 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 18 },
  /** 태그·탭 이름처럼 아주 작은 글자. 이것보다 작은 글자는 쓰지 않는다 */
  micro: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: -0.1 },
} as const;

/**
 * 아이콘 크기. 화면에서 숫자를 직접 쓰지 않는다 — 12·13·14·16·18·20·24·26·32·36·48·56이 흩어져 있었다(2026-09-24).
 *  xs  태그 안 · sm  캡션 옆 화살표·작은 체크 · md  본문 옆(체크박스·보조 링크) · lg  줄 오른쪽 화살표·툴팁 (i)
 *  xl  선택 표시·타일 안 · nav 헤더 버튼 · tab 탭바 · hero 빈 화면 그림
 * 글자와 짝: caption/label 옆은 sm, body 옆은 md, subheading 옆은 lg.
 */
export const iconSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, nav: 24, tab: 26, hero: 32 } as const;
/** 아이콘 타일(둥근 배경) 크기. 안의 아이콘은 절반이다 */
export const tileSize = { sm: 36, md: 40, lg: 48, xl: 56 } as const;
