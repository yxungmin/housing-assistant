/**
 * 공통 컴포넌트 (TDS 톤). 화면은 이 조합으로만 구성한다.
 *  Screen · Header · T/Sub · PageTitle · Card · SectionTitle · BigNumber · Tag/Chip · IconTile
 *  ConditionRow · ListRow · KeyValue · BottomCTA · PrimaryButton · BottomSheet · Notice
 * 원칙: 흰 화면 + grey50 카드, 헤어라인 대신 간격, 아이콘은 연한 타일 안에, 색은 CTA·상태에만.
 */
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { Animated, Dimensions, Easing, Image, Keyboard, LayoutAnimation, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, UIManager, View, type ImageSourcePropType, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScrollToTop } from "expo-router";
import { useTheme } from "@/theme/ThemeProvider";
import { koreanWon } from "@/lib/format";
import { fonts, iconSize, radius, space, tileSize, type } from "@/theme/tokens";
import { Icon, type IconName } from "./icon";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

/**
 * 조건이 갖춰지면 아래에서 올라오며 나타나고, 아니면 자리까지 비운다.
 * 자리를 비우는 게 핵심이다 — 흐린 버튼이 남아 있으면 "왜 안 눌리지"를 묻게 된다.
 */
export function SlideUp({ visible, children }: PropsWithChildren<{ visible: boolean }>) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 140,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, anim]);
  if (!mounted) return null;
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** 목록·카드 크기 변화를 부드럽게. 상태를 바꾸기 직전에 호출한다. */
export function animateLayout(duration = 220) {
  LayoutAnimation.configureNext({ duration, create: { type: "easeInEaseOut", property: "opacity" }, update: { type: "easeInEaseOut" }, delete: { type: "easeInEaseOut", property: "opacity" } });
}

/** 마운트 시 살짝 올라오며 나타남. key를 바꾸면 다시 재생된다 (단계 전환, 컴포넌트 교체). */
export function FadeIn({ children, style, delay = 0, distance = 12 }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; delay?: number; distance?: number }>) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, delay, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, [opacity, translateY, delay]);
  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

/**
 * 화면 틀. header·footer는 스크롤 밖에 두어 항상 고정된다 (스크롤 안에 두면 같이 밀려 올라간다).
 * 본문만 스크롤하고, footer가 있으면 아래 여백을 줄인다.
 */
/**
 * 화면 뼈대. 스크롤 영역 + 선택적 header/footer.
 *
 * `bottomInset`은 마지막 요소 아래 여백이다. 예전 기본값이 140이었는데, 그건 시안에서
 * CTA가 내용 위에 떠 있던 때의 값이다. 지금은 탭 바도 BottomCTA도 떠 있지 않다 —
 * 탭 바는 화면 영역 밖이고 footer는 이 컴포넌트의 형제라 제 자리를 차지한다.
 * 그래서 140은 아무것도 안 가리면서 탭 화면마다 빈 스크롤만 140px씩 만들고 있었다.
 */
export function Screen({ children, scroll = true, padded = true, style, bottomInset = space.section, header, footer, overlay, onRefresh, refreshing }: PropsWithChildren<{ scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; bottomInset?: number; header?: ReactNode; footer?: ReactNode; /** 스크롤 밖, 내용 위에 떠 있는 것(토스트). 스크롤 안에 두면 absolute의 기준이 긴 페이지 전체가 되어 화면 밖에 뜬다 */ overlay?: ReactNode; onRefresh?: () => void; refreshing?: boolean }>) {
  const { colors } = useTheme();
  const inner = padded ? { paddingHorizontal: space.screen } : undefined;
  /**
   * 지금 있는 탭을 다시 누르면 맨 위로 올라간다.
   *
   * 목록을 한참 내려 보다가 처음으로 돌아가려면 그만큼 다시 쓸어 올려야 했다.
   * 탭을 한 번 더 누르는 건 사람들이 이미 다른 앱에서 하는 동작이라 따로 배울 것이 없다.
   * useScrollToTop이 지금 화면이 포커스일 때만 듣기 때문에, 다른 탭을 누르는 것과 섞이지 않는다.
   */
  const scroller = useRef<ScrollView>(null);
  useScrollToTop(scroller);
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.surface }, style]} edges={["top", "left", "right"]}>
      {header}
      {scroll ? (
        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={[inner, { flexGrow: 1, paddingBottom: bottomInset, gap: space.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.text3} colors={[colors.primary]} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {overlay}
      {footer}
    </SafeAreaView>
  );
}

/** 상단 내비: 뒤로 · (작은) 제목 · 우측 액션 */
export function Header({ onBack, title, right }: { onBack?: () => void; title?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }}>
      <View style={{ width: 48, alignItems: "flex-start" }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로" style={({ pressed }) => ({ padding: 8, borderRadius: radius.pill, backgroundColor: pressed ? colors.cardSoft : "transparent" })}>
            <Icon name="left" size={iconSize.tab} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {title ? <Text {...wordWrap} style={[type.subheading, { color: colors.text }]}>{title}</Text> : <View />}
      <View style={{ width: 48, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

/** 아이콘 버튼. pop을 켜면 아이콘이 바뀔 때 한 번 튀어오른다 (관심 등록 등). */
export function IconButton({ name, onPress, label, color, pop }: { name: IconName; onPress?: () => void; label: string; color?: string; pop?: boolean }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (!pop) return;
    if (first.current) {
      first.current = false;
      return;
    }
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(scale, { toValue: 1, friction: 3.5, tension: 160, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, [name, pop, scale]);
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ padding: 8, borderRadius: radius.pill, backgroundColor: pressed ? colors.cardSoft : "transparent" })}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon name={name} size={iconSize.nav} color={color ?? colors.text} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * 한글은 기본값이 글자 단위 줄바꿈이라 어절 중간이 끊긴다. 어절(띄어쓰기) 단위로 끊는다.
 * iOS는 hangul-word, Android는 balanced, 웹은 data 속성 + 전역 CSS(word-break: keep-all).
 * 웹에서 style로 준 wordBreak은 react-native-web이 걸러내므로 dataSet을 쓴다.
 */
const wordWrap =
  Platform.OS === "web"
    ? ({ dataSet: { wordwrap: "keep-all" } } as object)
    : ({ lineBreakStrategyIOS: "hangul-word", textBreakStrategy: "balanced" } as object);

if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("ha-wordwrap")) {
  const style = document.createElement("style");
  style.id = "ha-wordwrap";
  style.textContent = '[data-wordwrap="keep-all"]{word-break:keep-all;overflow-wrap:break-word;}';
  document.head.appendChild(style);
}

export function T({ children, variant = "body", color, style, numeric, lines }: PropsWithChildren<{ variant?: keyof typeof type; color?: string; style?: StyleProp<TextStyle>; numeric?: boolean; lines?: number }>) {
  const { colors } = useTheme();
  return (
    <Text {...wordWrap} numberOfLines={lines} ellipsizeMode="tail" style={[type[variant], { color: color ?? colors.text }, numeric && { fontFamily: fonts.num, fontVariant: ["tabular-nums"] }, style]}>
      {children}
    </Text>
  );
}

export function Sub({ children, style, tone = "2", variant = "small", lines }: PropsWithChildren<{ style?: StyleProp<TextStyle>; tone?: "2" | "3"; variant?: "small" | "body" | "caption"; lines?: number }>) {
  const { colors } = useTheme();
  return <T variant={variant} color={tone === "3" ? colors.text3 : colors.text2} style={style} lines={lines}>{children}</T>;
}

/** 화면 제목 블록: 위 여백 넉넉히, 제목 크게, 부제 회색 */
/**
 * 빈 목록.
 *
 * 전에는 회색 상자 안에 아이콘·제목·설명을 넣어 화면 위쪽에 붙였다. 상자 아래가 통째로 비어 화면이 위로 쏠렸고,
 * 상자는 "여기 뭔가 있어야 하는데 비었다"보다 고장 난 칸처럼 보였다. 그리고 할 수 있는 일이 없었다.
 * 그래서 상자를 걷고 남은 자리 가운데에 두며, 채우는 방법을 버튼 하나로 같이 준다.
 */
/**
 * 빈 화면. 아이콘 동그라미 하나로는 "고장 났나"와 "아직 없다"가 구별되지 않았다 (2026-09-24).
 * 그림(illustration)이 있으면 그것을 크게, 없으면 아이콘. 제목은 화면 제목 크기, 행동은 진짜 버튼 하나.
 * 그림은 src/theme/illustrations.ts에서 오고 라이트·다크가 따로다 — 흰 배경용 그림을 어두운 판에 그대로 올리면 판이 뚫린 것처럼 보인다.
 */
export function EmptyState({ icon, illustration, title, body, action }: { icon: IconName; illustration?: ImageSourcePropType; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, minHeight: 420, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingBottom: 48, gap: 20 }}>
      {illustration ? (
        <Image source={illustration} accessibilityIgnoresInvertColors style={{ width: 220, height: 160 }} resizeMode="contain" />
      ) : (
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={iconSize.hero} color={colors.primary} />
        </View>
      )}
      <View style={{ alignItems: "center", gap: 8 }}>
        <T variant="heading" style={{ textAlign: "center" }}>{title}</T>
        <Sub variant="body" style={{ textAlign: "center", maxWidth: 300 }}>{body}</Sub>
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: 4, minHeight: 48, paddingVertical: 13, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: pressed ? colors.primaryPressed : colors.primary })}
        >
          <T variant="bodyMedium" color={colors.onPrimary} style={{ fontFamily: fonts.semiBold }}>{action.label}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ paddingTop: 20, gap: 8 }}>
      <T variant="title">{title}</T>
      {sub ? <Sub variant="body">{sub}</Sub> : null}
    </View>
  );
}

/** 카드: 흰 화면 위 grey50 면. 테두리·그림자 없음. */
export function Card({ children, style, onPress, tone = "soft" }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: "soft" | "white" | "strong" }>) {
  const { colors } = useTheme();
  const bg = tone === "white" ? colors.surface : tone === "strong" ? colors.cardSoft : colors.card;
  const s: StyleProp<ViewStyle> = [{ backgroundColor: bg, borderRadius: radius.lg, padding: space.xl, gap: space.md }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { backgroundColor: colors.cardSoft, transform: [{ scale: 0.99 }] }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

/** 섹션 제목: 검정 굵게 17 (TDS 리스트 헤더). 오른쪽에 링크 텍스트 가능 */
export function SectionTitle({ children, right, onRight }: PropsWithChildren<{ right?: string; onRight?: () => void }>) {
  const { colors } = useTheme();
  return (
    // 좌우 여백을 두지 않는다. 카드·본문은 화면 여백에서 시작하는데 제목만 4px 안에서 시작해 왼쪽 선이 두 줄이었다
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
      <T variant="subheading">{children}</T>
      {right ? (
        <Pressable onPress={onRight} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <T variant="small" color={colors.text3}>{right}</T>
          <Icon name="right" size={iconSize.sm} color={colors.text3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 아이콘 타일: 연한 색 사각형 안에 글리프 (TDS 리스트 아이콘) */
export function IconTile({ name, tone = "gray", size = tileSize.md }: { name: IconName; tone?: "gray" | "primary" | "warn" | "danger" | "info"; size?: number }) {
  const { colors } = useTheme();
  const bg = { gray: colors.cardSoft, primary: colors.primarySoft, warn: colors.warningSoft, danger: colors.dangerSoft, info: colors.infoSoft }[tone];
  const fg = { gray: colors.text2, primary: colors.primary, warn: colors.warning, danger: colors.danger, info: colors.info }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      {/* 선 아이콘은 타일의 의미색을 그대로 입는다 — 여기서는 색이 곧 판정이다.
          그림 아이콘(집·지하철 등)은 색이 박혀 있어 이 색을 무시한다 (icon/icons.ts). */}
      <Icon name={name} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

/**
 * 구독 전에 가려진 값 — 값이 있을 자리에 그 값의 글자 크기로, **금액 모양의 자리표시** "?,???만 원".
 *
 * 네 번째 모양이다 (2026-09-24 결정).
 *  1. "•,•••만": 점이 쉼표와 섞여 고장 난 숫자처럼 보였다.
 *  2. 회색 막대(+자물쇠): 로딩 뼈대(skeleton)와 같아서 "아직 안 불러왔나" 하고 기다리다 지나갔다.
 *  3. 물음표 하나(+자물쇠): 금액 같지 않았다 — 무엇이 들어올 자리인지 모양이 말해 주지 않았다.
 *  4. "?,???만 원": 자릿수·쉼표·단위는 진짜 금액과 같고 숫자만 물음표다. 여기 **금액이** 들어오고 지금은 모른다는 뜻이 한눈에 읽힌다.
 * 배경 면도 자물쇠도 없다 — 면은 뼈대로 읽히고, 자물쇠는 위 LockNote가 한 번 들면 된다.
 * BigNumber·KeyValue의 redacted와 화면의 낱개 가림이 모두 이걸 쓴다. 한 화면 안에서 모양이 하나여야 "잠긴 것"으로 읽힌다.
 */
export function Redacted({ size, text = "?,???만 원" }: { /** 가리는 값의 글자 크기. 그 자리에 그 크기로 앉는다 */ size: number; /** 자리표시 모양. 큰 숫자는 단위를 따로 붙이므로 "?,???만", 비율은 "??%" */ text?: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityLabel="가려진 값 — 구독하면 보여요" style={{ fontFamily: fonts.bold, fontSize: size, lineHeight: Math.round(size * 1.2), color: colors.text3, letterSpacing: -size * 0.035, fontVariant: ["tabular-nums"] }}>
      {text}
    </Text>
  );
}

/**
 * 잠긴 이유와 풀면 무엇을 보는지 알리는 카드. 공고 상세의 로그인 안내와 예상 주거비 미리보기가 같이 쓴다 —
 * 같은 일을 하는 안내가 화면마다 다른 모양이면(초록 안내 상자, 회색 카드…) 같은 말로 읽히지 않는다.
 */
export function LockNote({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 6 }}>
      {/* 제목이 두 줄이 되면 가운데 정렬은 아이콘을 두 줄 사이로 떨어뜨린다. 첫 줄에 붙인다 */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ paddingTop: 2 }}><Icon name="lock" size={iconSize.lg} color={colors.text2} /></View>
        <T variant="bodyMedium" style={{ flex: 1 }}>{title}</T>
      </View>
      <Sub tone="3" variant="caption">{body}</Sub>
    </Card>
  );
}

export function BigNumber({ value, unit, label, sub, size = 40, align = "left", redacted }: { value: string; unit?: string; label?: string; sub?: string; size?: number; align?: "left" | "right"; /** 구독 전 미리보기 — 숫자 자리에 물음표 (Redacted) */ redacted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {label ? <Sub>{label}</Sub> : null}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        {redacted ? (
          <Redacted size={size} text="?,???만" />
        ) : (
          <Text style={{ fontFamily: fonts.bold, fontSize: size, lineHeight: size * 1.2, color: colors.text, letterSpacing: -size * 0.035, fontVariant: ["tabular-nums"] }}>{value}</Text>
        )}
        {unit ? <Text style={{ fontFamily: fonts.bold, fontSize: Math.round(size * 0.5), color: colors.text2, letterSpacing: -0.5 }}>{unit}</Text> : null}
      </View>
      {sub ? <Sub tone="3">{sub}</Sub> : null}
    </View>
  );
}

type Tone = "primary" | "warn" | "danger" | "gray" | "info";
/** 상태 배지: 연한 면 + 굵은 글자. */
export function Tag({ children, tone = "primary", icon }: PropsWithChildren<{ tone?: Tone; icon?: IconName }>) {
  const { colors } = useTheme();
  const bg = { primary: colors.primarySoft, warn: colors.warningSoft, danger: colors.dangerSoft, gray: colors.cardSoft, info: colors.infoSoft }[tone];
  const fg = { primary: colors.primary, warn: colors.warning, danger: colors.danger, gray: colors.text2, info: colors.info }[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
      {icon ? <Icon name={icon} size={iconSize.xs} color={fg} /> : null}
      <Text {...wordWrap} style={[type.micro, { fontFamily: fonts.bold, color: fg }]}>{children}</Text>
    </View>
  );
}

/** 앱 마크. 아이콘 글리프 대신 실제 로고를 쓰는 자리 (홈 헤더 등) */
export function Logo({ size = 56 }: { size?: number }) {
  return <Image source={require("../../assets/logo.png")} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="공공주택 비서" />;
}

/**
 * 필터 칩: grey100 면, 선택은 검정 면.
 * `count`를 주면 "이걸 켜면 몇 개 남나"를 옆에 흐리게 붙인다 — 누르기 전에 결과 크기를 알게 한다.
 * 0이면 눌러도 빈 화면이 되므로 흐리게 깔고 눌리지 않게 한다.
 */
export function Chip({ children, on, count, onPress }: PropsWithChildren<{ on?: boolean; count?: number; onPress?: () => void }>) {
  const { colors } = useTheme();
  const dead = count === 0 && !on;
  return (
    <Pressable onPress={dead ? undefined : onPress} accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: dead }}
      accessibilityLabel={count === undefined ? undefined : `${children} ${count}개`}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
        opacity: dead ? 0.4 : 1,
        backgroundColor: on ? colors.text : pressed ? colors.cardStrong : colors.cardSoft,
      })}>
      <Text {...wordWrap} style={[type.small, { fontFamily: fonts.semiBold, color: on ? colors.surface : colors.text2 }]}>{children}</Text>
      {count === undefined ? null : (
        <Text style={[type.label, { color: on ? colors.surface : colors.text3, opacity: on ? 0.7 : 1, fontVariant: ["tabular-nums"] }]}>{count}</Text>
      )}
    </Pressable>
  );
}

/** 조건 행: 상태 타일 + 조건 + 내 입력 + 근거 쪽. 구분선 없음. */
/** 조건 한 줄. onPress를 주면 눌러서 근거를 펴 보고 신고할 수 있다 (ReportSheet). */
export function ConditionRow({
  status,
  title,
  why,
  page,
  onPress,
  flag,
  onFill,
  fillLabel = "지금 입력하기",
}: {
  status: "MATCH" | "NEEDS_CHECK" | "MISMATCH";
  title: string;
  why?: string;
  page?: number;
  first?: boolean;
  onPress?: () => void;
  flag?: string;
  /** 값이 없어 판별을 못 한 줄에만. 누르면 그 항목 하나를 받는 화면으로 간다 */
  onFill?: () => void;
  fillLabel?: string;
}) {
  const { colors } = useTheme();
  const map = {
    MATCH: { icon: "check" as const, tone: "primary" as const },
    NEEDS_CHECK: { icon: "alert" as const, tone: "warn" as const },
    MISMATCH: { icon: "x" as const, tone: "danger" as const },
  }[status];
  const inner = (pressed: boolean) => (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 10, paddingHorizontal: 4, marginHorizontal: -4, borderRadius: radius.md, alignItems: "flex-start", backgroundColor: pressed ? colors.cardStrong : "transparent" }}>
      <IconTile name={map.icon} tone={map.tone} size={tileSize.sm} />
      <View style={{ flex: 1, gap: 2, paddingTop: 1 }}>
        <T variant="bodyMedium">{title}</T>
        {why ? <Sub tone="3" variant="caption">{why}</Sub> : null}
        {/* 누를 수 있는 줄 안에 또 버튼을 두면 버튼 속의 버튼이 된다. 그래서 바깥에서 받는다 (아래 참고) */}
        {flag ? <View style={{ flexDirection: "row", paddingTop: 4 }}><Tag tone="info" icon="info">{flag}</Tag></View> : null}
      </View>
      {page ? <T variant="caption" color={colors.text4} style={{ paddingTop: 8 }}>p.{page}</T> : null}
    </View>
  );
  // 입력 버튼은 행 바깥에 나란히 둔다. 행 전체가 "근거 보기"라서, 그 안에 넣으면
  // 버튼 속의 버튼이 되고 값을 넣으려다 근거가 열린다.
  const withFill = (row: ReactNode) =>
    onFill ? (
      <View style={{ gap: 2 }}>
        {row}
        <Pressable
          onPress={onFill}
          accessibilityRole="button"
          accessibilityLabel={`${title} 입력하기`}
          style={({ pressed }) => ({ alignSelf: "flex-start", marginLeft: 54, marginBottom: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: pressed ? colors.primary : colors.primarySoft })}
        >
          {({ pressed }) => (
            <Text style={[type.label, { color: pressed ? colors.onPrimary : colors.primary }]}>{fillLabel}</Text>
          )}
        </Pressable>
      </View>
    ) : (
      row
    );

  return withFill(
    onPress ? (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} 근거 보기`}>{({ pressed }) => inner(pressed)}</Pressable>
    ) : (
      inner(false)
    ),
  );
}

/** 설정·정보 행: [아이콘 타일] 라벨/서브 … 값 › */
export function ListRow({ label, sub, value, icon, iconTone, onPress, danger }: { label: string; sub?: string; value?: ReactNode; icon?: IconName; iconTone?: "gray" | "primary" | "warn" | "danger" | "info"; onPress?: () => void; first?: boolean; danger?: boolean }) {
  const { colors } = useTheme();
  const inner = (pressed: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 4, borderRadius: radius.md, backgroundColor: pressed ? colors.cardSoft : "transparent" }}>
      {icon ? <IconTile name={icon} tone={iconTone ?? "gray"} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyMedium" color={danger ? colors.danger : colors.text}>{label}</T>
        {sub ? <Sub tone="3" variant="caption">{sub}</Sub> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {typeof value === "string" ? <T variant="small" color={colors.text3}>{value}</T> : value}
        {onPress ? <Icon name="right" size={iconSize.lg} color={colors.text4} /> : null}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{({ pressed }) => inner(pressed)}</Pressable> : inner(false);
}

/** 금액 행: 라벨 회색, 값 검정 굵게, 아래 출처 */
/**
 * 물음표 대신 쓰는 작은 (i). 누르면 그 자리에 말풍선이 뜬다.
 *
 * 출처("공고문 6쪽", "주택도시기금 2026.09.01 기준")는 없으면 안 되는 정보지만,
 * 줄마다 작은 회색 글씨로 깔리면 숫자를 읽는 데 방해가 된다. 실제로 화면 절반이 각주였다.
 * 그래서 평소에는 점 하나로 접어 두고, 궁금한 줄에서만 펴 보게 한다.
 *
 * 남발하지 않는다. 근거·출처처럼 "알고 싶으면 본다"에 해당하는 것만 넣는다.
 * 숫자를 어떻게 읽어야 하는지 바꾸는 말(추정값을 썼다 같은 것)은 접지 않고 그대로 둔다 —
 * 그건 눌러야 보이면 안 되는 종류의 사실이다.
 */
export function InfoTip({ text, label = "자세히" }: { text: string; label?: string }) {
  const { colors } = useTheme();
  const anchor = useRef<View>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  /**
   * 연 직후 잠깐은 배경 누름을 무시한다.
   *
   * 마우스로 누르면 pointerup에서 열리고, 곧이어 click 이벤트가 한 번 더 온다. 그 사이 배경이 먼저 깔려 있으면
   * 그 click이 배경에 떨어져 열리자마자 닫힌다 (웹에서 실측). 예전에는 모달 페이드 동안 배경이 입력을 안 받아
   * 우연히 가려져 있었을 뿐이다.
   */
  const openedAt = useRef(0);

  const open = () =>
    anchor.current?.measureInWindow((x, y, w, h) => {
      openedAt.current = Date.now();
      setSize(null);
      setBox({ x, y, w, h });
    });
  const closeFromBackdrop = () => {
    if (Date.now() - openedAt.current < 350) return;
    close();
  };
  const close = () =>
    Animated.timing(anim, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== "web" }).start(() => setBox(null));

  // 크기를 잰 뒤에 나타난다. 재기 전에 보이면 엉뚱한 자리에서 한 번 깜빡인다.
  useEffect(() => {
    if (!box || !size) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [box, size, anim]);

  /**
   * 자리 잡기.
   *
   * 말풍선은 글 길이만큼만 넓다 ("공고문 6쪽"에 260px 상자가 뜨지 않게). 폭은 재어서 안다.
   * 가운데를 (i)에 맞추되 화면 가장자리 16px 안으로 당기고, 아래가 모자라면 위로 뒤집는다.
   * 꼬리는 말풍선이 옆으로 밀려도 늘 (i)를 가리킨다 — 어느 (i)에서 나온 말인지가 꼬리의 일이다.
   */
  const screen = Dimensions.get("window");
  const EDGE = 16;
  const GAP = 6;
  const TAIL = 6;
  const maxWidth = Math.min(280, screen.width - EDGE * 2);
  const cx = box ? box.x + box.w / 2 : 0;
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const left = box ? Math.max(EDGE, Math.min(cx - w / 2, screen.width - w - EDGE)) : 0;
  const flip = box ? box.y + box.h + GAP + TAIL + h + 24 > screen.height : false;
  const top = box ? (flip ? box.y - GAP - TAIL - h : box.y + box.h + GAP + TAIL) : 0;
  const tailLeft = Math.max(10, Math.min(cx - left - TAIL, w - 10 - TAIL * 2));

  // 뒤집힌 색. 본문 카드와 한 톤 차이면 어디까지가 말풍선인지 안 보였다 —
  // 글자색을 바탕으로 쓰면 라이트·다크 어느 쪽에서도 가장 멀리 떨어진 색이 된다.
  const bg = colors.text;
  const fg = colors.surface;

  return (
    <>
      <Pressable
        ref={anchor}
        onPress={box ? close : open}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: !!box }}
        style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.5 : 1 })}
      >
        {/* 열려 있는 동안 (i)도 진해진다. 말풍선과 출발점이 한 쌍으로 보이게. */}
        <Icon name="info" size={iconSize.md} color={box ? colors.text2 : colors.text4} />
      </Pressable>
      <Modal visible={box !== null} transparent animationType="none" onRequestClose={close}>
        <Pressable style={{ flex: 1 }} onPress={closeFromBackdrop} accessibilityLabel="닫기">
          {box ? (
            <Animated.View
              onLayout={(e: LayoutChangeEvent) => {
                const { width, height } = e.nativeEvent.layout;
                if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
              }}
              style={{
                position: "absolute",
                left: size ? left : 0,
                top: size ? top : 0,
                maxWidth,
                opacity: size ? anim : 0,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [flip ? 4 : -4, 0] }) }],
              }}
            >
              <View
                style={{
                  backgroundColor: bg,
                  borderRadius: radius.sm + 2,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  shadowColor: "#000",
                  shadowOpacity: 0.16,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                }}
              >
                <Text {...wordWrap} style={[type.small, { color: fg, fontFamily: fonts.medium }]}>{text}</Text>
              </View>
              {/* 꼬리: 45도 돌린 사각형의 절반만 보이게 말풍선 가장자리에 걸친다 */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: tailLeft,
                  ...(flip ? { bottom: -TAIL + 1 } : { top: -TAIL + 1 }),
                  width: TAIL * 2,
                  height: TAIL * 2,
                  backgroundColor: bg,
                  borderRadius: 2,
                  transform: [{ rotate: "45deg" }],
                }}
              />
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

export function KeyValue({
  label,
  value,
  src,
  note,
  strong,
  amount,
  redacted,
  redactedText,
}: {
  label: string;
  value: string;
  /** 근거·출처. 라벨 옆 (i)에 접어 둔다 */
  src?: string;
  /**
   * 숫자를 어떻게 읽어야 하는지 바꾸는 말 (추정값을 썼다 등). 접지 않고 그대로 보여 준다 —
   * 눌러야 보이면 안 되는 종류의 사실이다.
   */
  note?: string;
  strong?: boolean;
  /**
   * 원 금액. 주면 숫자 아래에 한글로 읽는 법을 작게 붙인다 ("4천3백52만 원").
   * 43,520,000과 4,352,000은 쉼표 하나 차이인데 열 배가 다르고, 사람은 그 자리에서 잘못 읽는다.
   */
  amount?: number | null;
  /** 구독 전 미리보기 — 값 자리에 금액 모양 자리표시 (Redacted) */
  redacted?: boolean;
  /** 금액이 아닌 값의 자리표시 모양 ("?순위"). 기본은 "?,???만 원" */
  redactedText?: string;
}) {
  const { colors } = useTheme();
  const reading = redacted ? null : koreanWon(amount);
  /*
   * 좌우가 흩어져 보이던 이유가 셋이었다 (2026-09-24).
   *  1. 값이 길면 라벨이 짓눌려 "주변 / 월세 / 중앙값"처럼 한 단어씩 세 줄이 됐다.
   *     값 칸을 폭의 60%까지로 막는다. 라벨은 나머지를 쓰고, 긴 값은 그 안에서 줄바꿈한다.
   *  2. "보증금 1억 원 / 월 460,000원"처럼 두 값이 한 줄에 붙어 있었다. " / "에서 나눠 오른쪽에 줄마다 세운다 —
   *     오른쪽 칸이 늘 "한 줄에 한 값"이면 눈이 오른쪽 끝을 따라 내려가며 읽을 수 있다.
   *  3. 라벨이 여러 줄이면 (i)가 그 가운데에 떠 있었다. 첫 줄 높이에 붙인다.
   */
  const lines = value.split(" / ");
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
          <T variant="body" color={colors.text2} style={{ flexShrink: 1 }}>{label}</T>
          {src ? <View style={{ paddingTop: 2 }}><InfoTip text={src} label={`${label} 근거`} /></View> : null}
        </View>
        <View style={{ maxWidth: "60%", flexShrink: 1, alignItems: "flex-end", gap: 1 }}>
          {redacted ? (
            <Redacted size={strong ? type.subheading.fontSize : type.bodyMedium.fontSize} text={redactedText} />
          ) : (
            lines.map((line, i) => (
              <T key={i} variant={strong ? "subheading" : "bodyMedium"} numeric style={{ fontFamily: strong ? fonts.bold : fonts.semiBold, textAlign: "right" }}>
                {line}
              </T>
            ))
          )}
          {reading ? <Sub tone="3" variant="caption">{reading}</Sub> : null}
        </View>
      </View>
      {note ? <Sub tone="3" variant="caption">{note}</Sub> : null}
    </View>
  );
}

/** 하단 고정 CTA: 높이 56, 라운드 16. Screen의 footer 슬롯에 넣으면 스크롤과 무관하게 고정된다. */
/**
 * 지금 올라와 있는 키보드 높이 (없으면 0).
 * KeyboardAvoidingView는 헤더가 있는 화면에서 밀어 올리는 양을 덜 잡는 일이 있어,
 * 하단 버튼이 키보드에 반쯤 가린다. 재서 그만큼 올리는 편이 확실하다.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * 하단 CTA.
 * disabled 대신 `appear`를 주면 할 수 있을 때 버튼이 올라온다 — 흐린 버튼을 계속 보여 주는 대신
 * 버튼이 나타나는 것 자체를 "다 됐다"는 신호로 쓴다. 건너뛰기(secondary)는 그동안에도 남는다.
 */
/**
 * 하단 고정 버튼. 보조 동작이 하나 붙을 수 있다.
 * secondaryIcon이 있으면 밖으로 나가는 길이다(기관 사이트) — 글자를 한 단계 진하게 하고 화살표를 붙여
 * "나중에 입력할게요" 같은 물러서는 동작과 구별한다.
 */
export function BottomCTA({ label, onPress, disabled, appear, secondary, secondaryLabel, onSecondary, secondaryIcon }: { label: string; onPress: () => void; disabled?: boolean; appear?: boolean; secondary?: boolean; secondaryLabel?: string; onSecondary?: () => void; secondaryIcon?: IconName }) {
  const { colors } = useTheme();
  // 키보드가 올라오면 그 위로 붙는다. 홈 인디케이터 여백(28)은 키보드가 대신하므로 줄인다.
  const keyboard = useKeyboardHeight();
  return (
    <View style={{ paddingHorizontal: space.xl, paddingTop: 12, paddingBottom: keyboard > 0 ? 10 : 28, marginBottom: keyboard, gap: 4, backgroundColor: colors.surface }}>
      {appear !== undefined ? (
        <SlideUp visible={appear}>
          <PrimaryButton label={label} onPress={onPress} />
        </SlideUp>
      ) : (
        <PrimaryButton label={label} onPress={onPress} disabled={disabled} />
      )}
      {secondary && secondaryLabel ? (
        <Pressable onPress={onSecondary} style={({ pressed }) => ({ paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.6 : 1 })} accessibilityRole={secondaryIcon ? "link" : "button"}>
          <Text {...wordWrap} style={[type.small, { fontFamily: fonts.medium, color: secondaryIcon ? colors.text2 : colors.text3 }]}>{secondaryLabel}</Text>
          {secondaryIcon ? <Icon name={secondaryIcon} size={iconSize.md} color={colors.text3} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, tone = "primary" }: { label: string; onPress: () => void; disabled?: boolean; tone?: "primary" | "dark" | "soft" }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => {
        const bg = disabled ? colors.cardStrong : tone === "dark" ? colors.text : tone === "soft" ? (pressed ? colors.cardStrong : colors.cardSoft) : pressed ? colors.primaryPressed : colors.primary;
        return { height: 56, borderRadius: 16, backgroundColor: bg, alignItems: "center", justifyContent: "center", opacity: pressed && tone === "dark" ? 0.85 : 1 };
      }}>
      <Text {...wordWrap} numberOfLines={1} style={[type.subheading, { color: disabled ? colors.text3 : tone === "dark" ? colors.surface : tone === "soft" ? colors.text : colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const fill = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };
const SHEET_IN = 300;
const SHEET_OUT = 200;

/**
 * 시트: 손잡이 없이 큰 제목으로 시작.
 * 딤은 제자리에서 밝기만 바뀌고 패널만 아래에서 올라온다 (Modal의 slide는 딤까지 같이 밀어올려 어색하다).
 * 닫힐 때는 역재생이 끝난 뒤에 언마운트한다.
 */
export function BottomSheet({ visible, onClose, plain, children }: PropsWithChildren<{ visible: boolean; onClose: () => void; /** 안을 ScrollView로 감싸지 않는다 — 안에 FlatList처럼 스스로 스크롤하는 것이 있을 때 */ plain?: boolean }>) {
  const { colors } = useTheme();
  // 시트 안에 입력창이 있으면(신고·소득 도우미) 키보드가 보내기 버튼을 덮었다. BottomCTA처럼 키보드 높이만큼 올린다 (2026-09-24 감사)
  const keyboard = useKeyboardHeight();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(0);
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    const to = visible ? 1 : 0;
    const duration = visible ? SHEET_IN : SHEET_OUT;
    const animation = Animated.timing(anim, {
      toValue: to,
      duration,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    // 웹에서 Animated는 requestAnimationFrame에 기댄다. 탭이 그려지지 않아 프레임이 멈추면
    // 시트가 화면 밖에 그대로 남으므로, 시간이 지나면 최종 상태로 맞춘다.
    const settle =
      Platform.OS === "web"
        ? setTimeout(() => {
            anim.setValue(to);
            if (!visible) setMounted(false);
          }, duration + 80)
        : undefined;
    return () => {
      animation.stop();
      if (settle !== undefined) clearTimeout(settle);
    };
  }, [visible, anim]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== height) setHeight(h);
  };

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={{ ...fill, backgroundColor: colors.dim, opacity: anim }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="닫기" />
        </Animated.View>
        {/*
          높이를 제한하고 안을 스크롤시킨다.
          시트는 아래에 붙어 있어서(justifyContent: flex-end) 내용이 화면보다 길어지면
          **위쪽이 잘린다** — 구독 시트에서 실제로 제목이 잘렸다.
          자라게 두면 안 되고, 잘리게 두면 더 안 된다.
        */}
        <Animated.View
          onLayout={onLayout}
          style={{
            maxHeight: "88%",
            marginBottom: keyboard,
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [height || 520, 0] }) }],
          }}
        >
          {plain ? (
            <View style={{ paddingHorizontal: space.screen, paddingTop: 28, paddingBottom: 32, gap: space.xl, maxHeight: "100%" }}>{children}</View>
          ) : (
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: 28, paddingBottom: 32, gap: space.xl }}
            >
              {children}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function Row({ children, style, center }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; center?: boolean }>) {
  return <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: center ? "center" : "baseline", gap: 10 }, style]}>{children}</View>;
}

/** 안내: 연한 면 + 타일 + 한 문장 */
export function Notice({ tone = "primary", icon, children }: PropsWithChildren<{ tone?: "primary" | "warn" | "info"; icon?: IconName }>) {
  const { colors } = useTheme();
  const bg = tone === "warn" ? colors.warningSoft : tone === "info" ? colors.infoSoft : colors.primarySoft;
  const fg = tone === "warn" ? colors.warning : tone === "info" ? colors.info : colors.primary;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14 }}>
      {icon ? <Icon name={icon} size={iconSize.lg} color={fg} /> : null}
      <T variant="small" color={fg} style={{ flex: 1, fontFamily: fonts.semiBold }}>{children}</T>
    </View>
  );
}

export type { ReactNode };

/**
 * 토스트: 한 일을 알리고 사라진다.
 *
 * 북마크처럼 **되돌릴 수 있고 자주 하는 일**에 쓴다. 인라인 알림으로 띄우면 그 자리에
 * 카드가 하나 생겼다 사라지면서 아래 내용이 밀린다 — 읽던 자리를 잃는다.
 * 토스트는 내용 위에 뜨므로 레이아웃을 건드리지 않는다.
 *
 * 화면 아래에 둔다. 위쪽은 헤더와 겹치고, 손가락은 아래에 있다.
 */
export function Toast({ visible, children, tone = "info" }: PropsWithChildren<{ visible: boolean; tone?: "info" | "warn" }>) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, anim]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: space.screen,
        right: space.screen,
        bottom: 96,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: tone === "warn" ? colors.warningSoft : colors.cardStrong,
          borderRadius: radius.md,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <Icon name={tone === "warn" ? "alert" : "bell"} size={iconSize.lg} color={tone === "warn" ? colors.warning : colors.primary} />
        <Text {...wordWrap} style={[type.small, { flex: 1, fontFamily: fonts.medium, color: tone === "warn" ? colors.warning : colors.text }]}>
          {children}
        </Text>
      </View>
    </Animated.View>
  );
}
