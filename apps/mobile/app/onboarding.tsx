import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import type { UserProfile } from "@housing/schema";
import { ageFromBirthDate } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { BottomCTA, FadeIn, Header, IconButton, Screen, Sub, T } from "@/components/ui";
import { matchAll, pickBest } from "@/data/announcements";
import { isComplete, stepOptions, stepTitle, visibleSteps, type Step } from "@/lib/onboarding";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space } from "@/theme/tokens";

/** 조건 입력: 한 화면에 질문 하나, 하단 고정 CTA, 뒤로가기 자유. */
export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, setProfile, setFreeUnlock } = useAppState();
  const [draft, setDraft] = useState<Partial<UserProfile>>(state.profile ?? {});
  const [index, setIndex] = useState(0);
  const steps = useMemo(() => visibleSteps(draft), [draft]);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const value = step.read(draft);
  const [text, setText] = useState<string>(value === null ? "" : String(value));

  const go = (next: number, patch?: Partial<UserProfile>) => {
    const merged = patch ?? draft;
    const nextSteps = visibleSteps(merged);
    if (next >= nextSteps.length) return finish(merged);
    setDraft(merged);
    setIndex(next);
    const s = nextSteps[next]!;
    const v = s.read(merged);
    setText(v === null ? "" : String(v));
  };

  const finish = (p: Partial<UserProfile>) => {
    if (!isComplete(p)) return;
    const profile: UserProfile = { ...p, subscription_deposits: p.subscription_deposits ?? p.subscription_months };
    setProfile(profile, true);
    // 첫 무료 계산 대상만 정해 두고, 결과는 홈 목록에서 먼저 보게 한다 (사용자 피드백: 바로 상세로 가면 인지가 어렵다)
    const best = state.freeUnlockId ? null : pickBest(matchAll(profile));
    if (best) setFreeUnlock(best.announcement.id);
    router.replace("/(tabs)");
  };

  const numeric = step.kind === "won" || step.kind === "count" || step.kind === "age" || step.kind === "months" || step.kind === "date";
  const digits = text.replace(/[^0-9]/g, "");
  const parsed = numeric ? Number(digits) : NaN;
  const dateOk = step.kind === "date" && isValidBirthDate(digits);
  const canNext = step.kind === "select" ? value !== null : step.kind === "skip-info" || step.kind === "multi" ? true : step.kind === "date" ? dateOk : text !== "" && Number.isFinite(parsed);
  const selected = step.kind === "multi" ? String(value ?? "").split(",").filter(Boolean) : [];

  const onNext = () => {
    if (step.kind === "select" || step.kind === "skip-info") return go(index + 1);
    if (step.kind === "multi") return go(index + 1, step.apply(draft, selected.length ? selected.join(",") : null));
    if (step.kind === "date") return go(index + 1, step.apply(draft, digits));
    go(index + 1, step.apply(draft, parsed));
  };
  const onSkip = () => go(index + 1, step.apply(draft, null));
  const toggleMulti = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    setDraft((d) => step.apply(d, next.length ? next.join(",") : null));
  };
  const options = stepOptions(step, draft);
  const grid = options.length > 6;

  return (
    <Screen scroll={false} padded={false}>
      <Header onBack={() => (index === 0 ? router.back() : go(index - 1))} right={<IconButton name="x" label="닫기" onPress={() => router.back()} color={colors.text2} />} />
      <View style={{ height: 3, marginHorizontal: space.screen, borderRadius: 2, backgroundColor: colors.cardSoft, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${((index + 1) / steps.length) * 100}%`, backgroundColor: colors.primary }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <FadeIn key={step.id} style={{ flex: 1, paddingHorizontal: space.screen, paddingTop: 32, gap: space.md }}>
          <Sub tone="3">{index + 1} / {steps.length}</Sub>
          <T variant="title">{stepTitle(step, draft)}</T>
          {step.hint ? <T variant="body" color={colors.text2}>{step.hint}</T> : null}

          {(step.kind === "select" || step.kind === "multi") && (
            <View style={{ flexDirection: grid ? "row" : "column", flexWrap: grid ? "wrap" : "nowrap", gap: 10, marginTop: 12 }}>
              {options.map((o) => {
                const on = step.kind === "multi" ? selected.includes(o.value) : value === o.value;
                return (
                  <Pressable key={o.value} onPress={() => (step.kind === "multi" ? toggleMulti(o.value) : setDraft((d) => step.apply(d, o.value)))} accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 18, paddingVertical: grid ? 14 : 18, borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.card, opacity: pressed ? 0.85 : 1,
                      flexDirection: "row", alignItems: "center", justifyContent: grid ? "center" : "space-between", minWidth: grid ? (options.length > 20 ? "30%" : "22%") : undefined, flexGrow: grid ? 1 : 0,
                    })}>
                    <View style={{ gap: 2, alignItems: grid ? "center" : "flex-start" }}>
                      <T variant="bodyMedium" color={on ? colors.primary : colors.text}>{o.label}</T>
                      {o.hint ? <Sub tone="3">{o.hint}</Sub> : null}
                    </View>
                    {!grid ? <Icon name="check" size={20} color={on ? colors.primary : colors.line} strokeWidth={3} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {numeric && <NumberField step={step} text={text} onChange={setText} />}

          {step.helper ? (
            <View style={{ gap: 6, marginTop: 8 }}>
              <T variant="label" color={colors.primary}>건강보험료로 계산하기 (준비 중)</T>
              <Sub tone="3">{step.helper}</Sub>
            </View>
          ) : null}
        </FadeIn>
      </KeyboardAvoidingView>

      <BottomCTA
        label={index + 1 >= steps.length ? "내 조건으로 공고 찾기" : step.kind === "multi" && selected.length === 0 ? "해당 없음" : "다음"}
        onPress={onNext}
        disabled={!canNext}
        secondary={!!step.optional}
        secondaryLabel="나중에 입력할게요"
        onSecondary={onSkip}
      />
    </Screen>
  );
}

function NumberField({ step, text, onChange }: { step: Step; text: string; onChange: (t: string) => void }) {
  const { colors } = useTheme();
  const unit = { won: "원 / 월", count: "명", age: "세", months: "개월", date: "" }[step.kind as "won" | "count" | "age" | "months" | "date"];
  const unitLabel = step.id === "total_assets" || step.id === "car_value" || step.id === "cash" ? "원" : step.id === "marriage_years" ? "년" : unit;
  const digits = text.replace(/[^0-9]/g, "");
  const isDate = step.kind === "date";
  const display = isDate ? formatDateDigits(digits) : text ? Number(digits).toLocaleString("ko-KR") : "";
  const valid = isDate && isValidBirthDate(digits);
  const ageNote = valid ? `만 ${ageFromBirthDate(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`)}세` : isDate ? "예: 1998.03.15" : "";
  const isWon = step.kind === "won";
  const manwon = isWon && digits ? summarizeWon(Number(digits)) : "";
  return (
    <View style={{ gap: 10, marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 10, gap: 10 }}>
        <TextInput
          value={display}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, "").slice(0, isDate ? 8 : 15))}
          keyboardType="number-pad"
          autoFocus
          placeholder={isDate ? "1998.03.15" : "0"}
          placeholderTextColor={colors.line}
          numberOfLines={1}
          selectionColor={colors.primary}
          style={[{ flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: display.length > 12 ? 28 : display.length > 9 ? 32 : 36, lineHeight: 44, color: colors.text, padding: 0, letterSpacing: -1, fontVariant: ["tabular-nums"] }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
          accessibilityLabel={typeof step.title === "string" ? step.title : step.id}
        />
        {!isDate ? <T variant="subheading" color={colors.text2} style={{ flexShrink: 0 }}>{unitLabel}</T> : null}
      </View>
      {isDate ? <T variant="bodyMedium" color={valid ? colors.primary : colors.text3}>{ageNote}</T> : null}
      {isWon && manwon ? <T variant="bodyMedium" color={colors.primary}>{manwon}</T> : null}
    </View>
  );
}

function summarizeWon(n: number): string {
  if (n <= 0) return "";
  const eok = Math.floor(n / 100_000_000);
  const man = Math.round((n % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString("ko-KR")}만 원` : `${eok}억 원`;
  if (man > 0) return `${man.toLocaleString("ko-KR")}만 원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

function formatDateDigits(d: string): string {
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function isValidBirthDate(d: string): boolean {
  if (d.length !== 8) return false;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8));
  const now = new Date().getFullYear();
  if (y < now - 120 || y > now) return false;
  if (m < 1 || m > 12) return false;
  const dim = new Date(y, m, 0).getDate();
  if (day < 1 || day > dim) return false;
  return new Date(y, m - 1, day).getTime() <= Date.now();
}
