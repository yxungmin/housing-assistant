/**
 * 공통 컴포넌트 (TDS 톤). 화면은 이 조합으로만 구성한다.
 *  Screen · Header · T/Sub · PageTitle · Card · SectionTitle · BigNumber · Tag/Chip · IconTile
 *  ConditionRow · ListRow · KeyValue · BottomCTA · PrimaryButton · BottomSheet · Notice
 * 원칙: 흰 화면 + grey50 카드, 헤어라인 대신 간격, 아이콘은 연한 타일 안에, 색은 CTA·상태에만.
 */
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { Animated, Easing, Image, Keyboard, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Text, UIManager, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space, type } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";

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
export function Screen({ children, scroll = true, padded = true, style, bottomInset = space.section, header, footer }: PropsWithChildren<{ scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; bottomInset?: number; header?: ReactNode; footer?: ReactNode }>) {
  const { colors } = useTheme();
  const inner = padded ? { paddingHorizontal: space.screen } : undefined;
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.surface }, style]} edges={["top", "left", "right"]}>
      {header}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[inner, { paddingBottom: bottomInset, gap: space.xl }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
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
            <Icon name="left" size={26} color={colors.text} strokeWidth={2.2} />
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
        <Icon name={name} size={24} color={color ?? colors.text} strokeWidth={2} />
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
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, paddingHorizontal: 4 }}>
      <T variant="subheading">{children}</T>
      {right ? (
        <Pressable onPress={onRight} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <T variant="small" color={colors.text3}>{right}</T>
          <Icon name="right" size={14} color={colors.text3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 아이콘 타일: 연한 색 사각형 안에 글리프 (TDS 리스트 아이콘) */
export function IconTile({ name, tone = "gray", size = 40 }: { name: IconName; tone?: "gray" | "primary" | "warn" | "danger" | "info"; size?: number }) {
  const { colors } = useTheme();
  const bg = { gray: colors.cardSoft, primary: colors.primarySoft, warn: colors.warningSoft, danger: colors.dangerSoft, info: colors.infoSoft }[tone];
  const fg = { gray: colors.text2, primary: colors.primary, warn: colors.warning, danger: colors.danger, info: colors.info }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={fg} strokeWidth={2.4} />
    </View>
  );
}

/** 큰 숫자 */
export function BigNumber({ value, unit, label, sub, size = 40, align = "left" }: { value: string; unit?: string; label?: string; sub?: string; size?: number; align?: "left" | "right" }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {label ? <Sub>{label}</Sub> : null}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: size, lineHeight: size * 1.2, color: colors.text, letterSpacing: -size * 0.035, fontVariant: ["tabular-nums"] }}>{value}</Text>
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
      {icon ? <Icon name={icon} size={12} color={fg} strokeWidth={3} /> : null}
      <Text {...wordWrap} style={[{ fontFamily: fonts.bold, fontSize: 12, color: fg, lineHeight: 16, letterSpacing: -0.1 }]}>{children}</Text>
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
      <Text {...wordWrap} style={[{ fontFamily: fonts.semiBold, fontSize: 14, color: on ? colors.surface : colors.text2, letterSpacing: -0.2 }]}>{children}</Text>
      {count === undefined ? null : (
        <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: on ? colors.surface : colors.text3, opacity: on ? 0.7 : 1, fontVariant: ["tabular-nums"] }}>{count}</Text>
      )}
    </Pressable>
  );
}

/** 조건 행: 상태 타일 + 조건 + 내 입력 + 근거 쪽. 구분선 없음. */
/** 조건 한 줄. onPress를 주면 눌러서 근거를 펴 보고 신고할 수 있다 (ReportSheet). */
export function ConditionRow({ status, title, why, page, onPress, flag }: { status: "MATCH" | "NEEDS_CHECK" | "MISMATCH"; title: string; why?: string; page?: number; first?: boolean; onPress?: () => void; flag?: string }) {
  const { colors } = useTheme();
  const map = {
    MATCH: { icon: "check" as const, tone: "primary" as const },
    NEEDS_CHECK: { icon: "alert" as const, tone: "warn" as const },
    MISMATCH: { icon: "x" as const, tone: "danger" as const },
  }[status];
  const inner = (pressed: boolean) => (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 10, paddingHorizontal: 4, marginHorizontal: -4, borderRadius: radius.md, alignItems: "flex-start", backgroundColor: pressed ? colors.cardStrong : "transparent" }}>
      <IconTile name={map.icon} tone={map.tone} size={36} />
      <View style={{ flex: 1, gap: 2, paddingTop: 1 }}>
        <T variant="bodyMedium" style={{ fontSize: 15.5 }}>{title}</T>
        {why ? <Sub tone="3" variant="caption">{why}</Sub> : null}
        {flag ? <View style={{ flexDirection: "row", paddingTop: 4 }}><Tag tone="info" icon="info">{flag}</Tag></View> : null}
      </View>
      {page ? <T variant="caption" color={colors.text4} style={{ paddingTop: 8 }}>p.{page}</T> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} 근거 보기`}>{({ pressed }) => inner(pressed)}</Pressable>
  ) : (
    inner(false)
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
        {onPress ? <Icon name="right" size={18} color={colors.text4} /> : null}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{({ pressed }) => inner(pressed)}</Pressable> : inner(false);
}

/** 금액 행: 라벨 회색, 값 검정 굵게, 아래 출처 */
export function KeyValue({ label, value, src, strong }: { label: string; value: string; src?: string; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <T variant="body" color={colors.text2} style={{ flex: 1 }}>{label}</T>
        <T variant={strong ? "subheading" : "bodyMedium"} numeric style={{ fontFamily: strong ? fonts.bold : fonts.semiBold }}>{value}</T>
      </View>
      {src ? <Sub tone="3" variant="caption">{src}</Sub> : null}
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
export function BottomCTA({ label, onPress, disabled, appear, secondary, secondaryLabel, onSecondary }: { label: string; onPress: () => void; disabled?: boolean; appear?: boolean; secondary?: boolean; secondaryLabel?: string; onSecondary?: () => void }) {
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
        <Pressable onPress={onSecondary} style={{ paddingVertical: 12, alignItems: "center" }} accessibilityRole="button">
          <Text {...wordWrap} style={[{ fontFamily: fonts.medium, fontSize: 15, color: colors.text3 }]}>{secondaryLabel}</Text>
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
      <Text {...wordWrap} numberOfLines={1} style={[{ fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.3, color: disabled ? colors.text3 : tone === "dark" ? colors.surface : tone === "soft" ? colors.text : colors.onPrimary }]}>{label}</Text>
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
export function BottomSheet({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const { colors } = useTheme();
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
        <Animated.View
          onLayout={onLayout}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: space.screen,
            paddingTop: 28,
            paddingBottom: 32,
            gap: space.xl,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [height || 520, 0] }) }],
          }}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function Row({ children, style, center }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; center?: boolean }>) {
  return <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: center ? "center" : "baseline", gap: 10 }, style]}>{children}</View>;
}

export function Divider({ inset }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.line, marginHorizontal: inset ?? 0, opacity: 0.7 }} />;
}

/** 안내: 연한 면 + 타일 + 한 문장 */
export function Notice({ tone = "primary", icon, children }: PropsWithChildren<{ tone?: "primary" | "warn" | "info"; icon?: IconName }>) {
  const { colors } = useTheme();
  const bg = tone === "warn" ? colors.warningSoft : tone === "info" ? colors.infoSoft : colors.primarySoft;
  const fg = tone === "warn" ? colors.warning : tone === "info" ? colors.info : colors.primary;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14 }}>
      {icon ? <Icon name={icon} size={18} color={fg} strokeWidth={2.6} /> : null}
      <T variant="small" color={fg} style={{ flex: 1, fontFamily: fonts.semiBold }}>{children}</T>
    </View>
  );
}

export type { ReactNode };
