/**
 * 공통 컴포넌트 (TDS 톤). 화면은 이 조합으로만 구성한다.
 *  Screen · Header · T/Sub · PageTitle · Card · SectionTitle · BigNumber · Tag/Chip · IconTile
 *  ConditionRow · ListRow · KeyValue · BottomCTA · PrimaryButton · BottomSheet · Notice
 * 원칙: 흰 화면 + grey50 카드, 헤어라인 대신 간격, 아이콘은 연한 타일 안에, 색은 CTA·상태에만.
 */
import { type PropsWithChildren, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space, type } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";

export function Screen({ children, scroll = true, padded = true, style, bottomInset = 140 }: PropsWithChildren<{ scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; bottomInset?: number }>) {
  const { colors } = useTheme();
  const inner = padded ? { paddingHorizontal: space.screen } : undefined;
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.surface }, style]} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: bottomInset, gap: space.xl }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
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
      {title ? <Text style={[type.subheading, { color: colors.text }]}>{title}</Text> : <View />}
      <View style={{ width: 48, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function IconButton({ name, onPress, label, color }: { name: IconName; onPress?: () => void; label: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ padding: 8, borderRadius: radius.pill, backgroundColor: pressed ? colors.cardSoft : "transparent" })}>
      <Icon name={name} size={24} color={color ?? colors.text} strokeWidth={2} />
    </Pressable>
  );
}

export function T({ children, variant = "body", color, style, numeric, lines }: PropsWithChildren<{ variant?: keyof typeof type; color?: string; style?: StyleProp<TextStyle>; numeric?: boolean; lines?: number }>) {
  const { colors } = useTheme();
  return (
    <Text numberOfLines={lines} ellipsizeMode="tail" style={[type[variant], { color: color ?? colors.text }, numeric && { fontFamily: fonts.num, fontVariant: ["tabular-nums"] }, style]}>
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
      <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: fg, lineHeight: 16, letterSpacing: -0.1 }}>{children}</Text>
    </View>
  );
}

/** 필터 칩: grey100 면, 선택은 검정 면 */
export function Chip({ children, on, onPress }: PropsWithChildren<{ on?: boolean; onPress?: () => void }>) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: on ? colors.text : pressed ? colors.cardStrong : colors.cardSoft })}>
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 14, color: on ? colors.surface : colors.text2, letterSpacing: -0.2 }}>{children}</Text>
    </Pressable>
  );
}

/** 조건 행: 상태 타일 + 조건 + 내 입력 + 근거 쪽. 구분선 없음. */
export function ConditionRow({ status, title, why, page }: { status: "MATCH" | "NEEDS_CHECK" | "MISMATCH"; title: string; why?: string; page?: number; first?: boolean }) {
  const { colors } = useTheme();
  const map = {
    MATCH: { icon: "check" as const, tone: "primary" as const },
    NEEDS_CHECK: { icon: "alert" as const, tone: "warn" as const },
    MISMATCH: { icon: "x" as const, tone: "danger" as const },
  }[status];
  return (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 10, alignItems: "flex-start" }}>
      <IconTile name={map.icon} tone={map.tone} size={36} />
      <View style={{ flex: 1, gap: 2, paddingTop: 1 }}>
        <T variant="bodyMedium" style={{ fontSize: 15.5 }}>{title}</T>
        {why ? <Sub tone="3" variant="caption">{why}</Sub> : null}
      </View>
      {page ? <T variant="caption" color={colors.text4} style={{ paddingTop: 8 }}>p.{page}</T> : null}
    </View>
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

/** 하단 고정 CTA: 높이 56, 라운드 16 */
export function BottomCTA({ label, onPress, disabled, secondary, secondaryLabel, onSecondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; secondaryLabel?: string; onSecondary?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: 12, paddingBottom: 28, gap: 4, backgroundColor: colors.surface }}>
      <PrimaryButton label={label} onPress={onPress} disabled={disabled} />
      {secondary && secondaryLabel ? (
        <Pressable onPress={onSecondary} style={{ paddingVertical: 12, alignItems: "center" }} accessibilityRole="button">
          <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.text3 }}>{secondaryLabel}</Text>
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
      <Text style={{ fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.3, color: disabled ? colors.text3 : tone === "dark" ? colors.surface : tone === "soft" ? colors.text : colors.onPrimary }}>{label}</Text>
    </Pressable>
  );
}

/** 시트: 손잡이 없이 큰 제목으로 시작 */
export function BottomSheet({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.dim }} onPress={onClose} accessibilityLabel="닫기" />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.screen, paddingTop: 28, paddingBottom: 32, gap: space.xl }}>
        {children}
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
