/**
 * 공통 컴포넌트 5~6개. 화면은 이 조합으로만 구성한다 (문서: 화면 구성과 디자인 방향).
 *  Screen · Card · BigNumber · Tag/Chip · ConditionRow · BottomCTA · BottomSheet
 */
import { type PropsWithChildren, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space, type } from "@/theme/tokens";
import { Icon } from "./Icon";

export function Screen({ children, scroll = true, padded = true, style }: PropsWithChildren<{ scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle> }>) {
  const { colors } = useTheme();
  const inner = padded ? { paddingHorizontal: space.lg } : undefined;
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.surface }, style]} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: 120, gap: space.md }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
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

export function Sub({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  const { colors } = useTheme();
  return <T variant="small" color={colors.text2} style={style}>{children}</T>;
}

export function Card({ children, style, onPress }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; onPress?: () => void }>) {
  const { colors } = useTheme();
  const s = [{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

/** 큰 숫자: 단위와 보조 설명은 회색 작은 글씨로 아래에 */
export function BigNumber({ value, unit, label, sub, size = 34 }: { value: string; unit?: string; label?: string; sub?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      {label ? <Sub>{label}</Sub> : null}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={{ fontFamily: fonts.num, fontSize: size, lineHeight: size * 1.15, color: colors.text, letterSpacing: -0.5, fontVariant: ["tabular-nums"] }}>{value}</Text>
        {unit ? <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.text2 }}>{unit}</Text> : null}
      </View>
      {sub ? <Sub>{sub}</Sub> : null}
    </View>
  );
}

type Tone = "primary" | "warn" | "danger" | "gray";
export function Tag({ children, tone = "primary", icon }: PropsWithChildren<{ tone?: Tone; icon?: "check" | "alert" | "x" }>) {
  const { colors } = useTheme();
  const bg = { primary: colors.primarySoft, warn: colors.warningSoft, danger: colors.dangerSoft, gray: colors.surface }[tone];
  const fg = { primary: colors.primary, warn: colors.warning, danger: colors.danger, gray: colors.text2 }[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: tone === "gray" ? 1 : 0, borderColor: colors.border }}>
      {icon ? <Icon name={icon} size={11} color={fg} strokeWidth={2.8} /> : null}
      <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: fg, lineHeight: 14 }}>{children}</Text>
    </View>
  );
}

export function Chip({ children, on, onPress }: PropsWithChildren<{ on?: boolean; onPress?: () => void }>) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: on ? "transparent" : colors.border }}>
      <Text style={{ fontFamily: on ? fonts.bold : fonts.regular, fontSize: 12, color: on ? colors.primary : colors.text2 }}>{children}</Text>
    </Pressable>
  );
}

/** 조건 행: ✓ 일치 / △ 확인 필요 / ✕ 불일치 + 근거 쪽 (색이 아니라 아이콘+문구로도 읽히게) */
export function ConditionRow({ status, title, why, page, first }: { status: "MATCH" | "NEEDS_CHECK" | "MISMATCH"; title: string; why?: string; page?: number; first?: boolean }) {
  const { colors } = useTheme();
  const map = {
    MATCH: { icon: "check" as const, fg: colors.ok, bg: colors.primarySoft },
    NEEDS_CHECK: { icon: "alert" as const, fg: colors.warning, bg: colors.warningSoft },
    MISMATCH: { icon: "x" as const, fg: colors.danger, bg: colors.dangerSoft },
  }[status];
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 9, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: map.bg, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <Icon name={map.icon} size={12} color={map.fg} strokeWidth={2.8} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="small" style={{ fontFamily: fonts.medium, fontSize: 13.5 }}>{title}</T>
        {why ? <T variant="caption" color={colors.text2}>{why}</T> : null}
      </View>
      {page ? <T variant="caption" color={colors.primary} style={{ marginTop: 2 }}>p.{page}</T> : null}
    </View>
  );
}

export function BottomCTA({ label, onPress, disabled, secondary, secondaryLabel, onSecondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; secondaryLabel?: string; onSecondary?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: 28, gap: 4, backgroundColor: colors.surface }}>
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
        style={({ pressed }) => ({ backgroundColor: disabled ? colors.border : colors.primary, opacity: pressed ? 0.9 : 1, borderRadius: 14, paddingVertical: 15, alignItems: "center" })}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: disabled ? colors.text2 : colors.onPrimary }}>{label}</Text>
      </Pressable>
      {secondary && secondaryLabel ? (
        <Pressable onPress={onSecondary} style={{ paddingVertical: 8, alignItems: "center" }} accessibilityRole="button">
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.text2 }}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 아래에서 올라오는 시트. 상세·구매·시나리오 조정은 전부 이걸로 처리한다. */
export function BottomSheet({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.dim }} onPress={onClose} accessibilityLabel="닫기" />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: 32, gap: space.md }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 4 }} />
        {children}
      </View>
    </Modal>
  );
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 10 }, style]}>{children}</View>;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export const styles = StyleSheet.create({});
export type { ReactNode };
