/**
 * 공통 컴포넌트. 화면은 이 조합으로만 구성한다.
 *  Screen · Header · T/Sub · Card · Section · BigNumber · Tag/Chip · ConditionRow · ListRow · BottomCTA · BottomSheet
 * 토스 톤: 테두리 대신 면 대비, 넉넉한 여백, 큰 제목·숫자, 색은 CTA·상태에만.
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
        <ScrollView contentContainerStyle={[inner, { paddingBottom: bottomInset, gap: space.lg }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** 화면 상단 내비: 뒤로 · 제목 · 우측 액션. 제목은 스크롤 제목과 겹치지 않게 작게. */
export function Header({ onBack, title, right }: { onBack?: () => void; title?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg }}>
      <View style={{ width: 44, alignItems: "flex-start" }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로" style={{ padding: 4 }}>
            <Icon name="left" size={24} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      {title ? <Text style={[type.subheading, { color: colors.text }]}>{title}</Text> : <View />}
      <View style={{ width: 44, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function IconButton({ name, onPress, label, color }: { name: IconName; onPress?: () => void; label: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={{ padding: 4 }}>
      <Icon name={name} size={24} color={color ?? colors.text} strokeWidth={2} />
    </Pressable>
  );
}

export function T({ children, variant = "body", color, style, numeric }: PropsWithChildren<{ variant?: keyof typeof type; color?: string; style?: StyleProp<TextStyle>; numeric?: boolean }>) {
  const { colors } = useTheme();
  return (
    <Text style={[type[variant], { color: color ?? colors.text }, numeric && { fontFamily: fonts.num, fontVariant: ["tabular-nums"] }, style]}>
      {children}
    </Text>
  );
}

export function Sub({ children, style, tone = "2" }: PropsWithChildren<{ style?: StyleProp<TextStyle>; tone?: "2" | "3" }>) {
  const { colors } = useTheme();
  return <T variant="small" color={tone === "3" ? colors.text3 : colors.text2} style={style}>{children}</T>;
}

/** 화면 제목 블록: 제목 크게, 부제 회색. 상단 여백을 넉넉히. */
export function PageTitle({ title, sub, eyebrow }: { title: string; sub?: string; eyebrow?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingTop: 20, paddingBottom: 4, gap: 6 }}>
      {eyebrow ? <T variant="label" color={colors.text3}>{eyebrow}</T> : null}
      <T variant="title">{title}</T>
      {sub ? <Sub>{sub}</Sub> : null}
    </View>
  );
}

/** 카드: 테두리 없이 흰 면. 회색 배경 위에서만 구분된다. */
export function Card({ children, style, onPress, soft }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; onPress?: () => void; soft?: boolean }>) {
  const { colors } = useTheme();
  const s: StyleProp<ViewStyle> = [{ backgroundColor: soft ? colors.cardSoft : colors.card, borderRadius: radius.lg, padding: space.xl, gap: space.md }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.8, transform: [{ scale: 0.995 }] }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

/** 섹션 제목 (목록 위 작은 회색 라벨) */
export function SectionTitle({ children, right }: PropsWithChildren<{ right?: ReactNode }>) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
      <T variant="label" color={colors.text3}>{children}</T>
      {right}
    </View>
  );
}

/** 큰 숫자: 라벨 회색 위, 숫자 아주 크게, 단위는 작게 */
export function BigNumber({ value, unit, label, sub, size = 40, align = "left" }: { value: string; unit?: string; label?: string; sub?: string; size?: number; align?: "left" | "right" }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {label ? <Sub>{label}</Sub> : null}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: size, lineHeight: size * 1.2, color: colors.text, letterSpacing: -size * 0.03, fontVariant: ["tabular-nums"] }}>{value}</Text>
        {unit ? <Text style={{ fontFamily: fonts.semiBold, fontSize: Math.round(size * 0.5), color: colors.text2 }}>{unit}</Text> : null}
      </View>
      {sub ? <Sub tone="3">{sub}</Sub> : null}
    </View>
  );
}

type Tone = "primary" | "warn" | "danger" | "gray";
/** 상태 태그: 배경 연하게, 글자 굵게. 아이콘은 원 배경 없는 글리프. */
export function Tag({ children, tone = "primary", icon }: PropsWithChildren<{ tone?: Tone; icon?: IconName }>) {
  const { colors } = useTheme();
  const bg = { primary: colors.primarySoft, warn: colors.warningSoft, danger: colors.dangerSoft, gray: colors.cardSoft }[tone];
  const fg = { primary: colors.primary, warn: colors.warning, danger: colors.danger, gray: colors.text2 }[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
      {icon ? <Icon name={icon} size={12} color={fg} strokeWidth={3} /> : null}
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 12.5, color: fg, lineHeight: 16 }}>{children}</Text>
    </View>
  );
}

/** 필터 칩: 회색 면, 선택 시 어두운 면 (토스식). */
export function Chip({ children, on, onPress }: PropsWithChildren<{ on?: boolean; onPress?: () => void }>) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: on ? colors.text : colors.cardSoft, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 14, color: on ? colors.card : colors.text2 }}>{children}</Text>
    </Pressable>
  );
}

/** 조건 행: 글리프 + 조건 + 내 입력 + 근거 쪽. 구분선은 연한 라인. */
export function ConditionRow({ status, title, why, page, first }: { status: "MATCH" | "NEEDS_CHECK" | "MISMATCH"; title: string; why?: string; page?: number; first?: boolean }) {
  const { colors } = useTheme();
  const map = {
    MATCH: { icon: "check" as const, fg: colors.ok },
    NEEDS_CHECK: { icon: "alert" as const, fg: colors.warning },
    MISMATCH: { icon: "x" as const, fg: colors.danger },
  }[status];
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View style={{ width: 22, alignItems: "center", paddingTop: 3 }}>
        <Icon name={map.icon} size={18} color={map.fg} strokeWidth={3} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyMedium">{title}</T>
        {why ? <Sub tone="3">{why}</Sub> : null}
      </View>
      {page ? <T variant="caption" color={colors.text3} style={{ paddingTop: 4 }}>p.{page}</T> : null}
    </View>
  );
}

/** 설정·정보 행: 왼쪽 라벨, 오른쪽 값(또는 chevron) */
export function ListRow({ label, value, onPress, first, danger }: { label: string; value?: ReactNode; onPress?: () => void; first?: boolean; danger?: boolean }) {
  const { colors } = useTheme();
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 16, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <T variant="bodyMedium" color={danger ? colors.danger : colors.text}>{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {typeof value === "string" ? <Sub>{value}</Sub> : value}
        {onPress ? <Icon name="right" size={18} color={colors.text3} /> : null}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{inner}</Pressable> : inner;
}

/** 하단 고정 CTA: 높이 56, 라운드 16 */
export function BottomCTA({ label, onPress, disabled, secondary, secondaryLabel, onSecondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; secondaryLabel?: string; onSecondary?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: 12, paddingBottom: 28, gap: 6, backgroundColor: colors.surface }}>
      <PrimaryButton label={label} onPress={onPress} disabled={disabled} />
      {secondary && secondaryLabel ? (
        <Pressable onPress={onSecondary} style={{ paddingVertical: 10, alignItems: "center" }} accessibilityRole="button">
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.text3 }}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, tone = "primary" }: { label: string; onPress: () => void; disabled?: boolean; tone?: "primary" | "dark" | "soft" }) {
  const { colors } = useTheme();
  const bg = disabled ? colors.cardSoft : tone === "dark" ? colors.text : tone === "soft" ? colors.cardSoft : colors.primary;
  const fg = disabled ? colors.text3 : tone === "dark" ? colors.card : tone === "soft" ? colors.text : colors.onPrimary;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 56, borderRadius: radius.md + 2, backgroundColor: bg, opacity: pressed ? 0.88 : 1, alignItems: "center", justifyContent: "center" })}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: fg }}>{label}</Text>
    </Pressable>
  );
}

/** 아래에서 올라오는 시트: 손잡이 없이 큰 제목으로 시작 */
export function BottomSheet({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.dim }} onPress={onClose} accessibilityLabel="닫기" />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.screen, paddingTop: 28, paddingBottom: 32, gap: space.lg }}>
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
  return <View style={{ height: 1, backgroundColor: colors.line, marginHorizontal: inset ?? 0 }} />;
}

/** 안내 배너: 연한 면 + 글리프 + 한 문장 */
export function Notice({ tone = "primary", icon, children }: PropsWithChildren<{ tone?: "primary" | "warn"; icon?: IconName }>) {
  const { colors } = useTheme();
  const bg = tone === "warn" ? colors.warningSoft : colors.primarySoft;
  const fg = tone === "warn" ? colors.warning : colors.primary;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: bg, borderRadius: radius.md, padding: 14 }}>
      {icon ? <Icon name={icon} size={18} color={fg} strokeWidth={2.4} /> : null}
      <T variant="small" color={fg} style={{ flex: 1, fontFamily: fonts.medium }}>{children}</T>
    </View>
  );
}

export type { ReactNode };
