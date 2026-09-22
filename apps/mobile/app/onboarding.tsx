import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import type { UserProfile } from "@housing/schema";
import { ageFromBirthDate } from "@housing/engine";
import { Icon } from "@/components/icon";
import { IncomeHelperSheet } from "@/components/IncomeHelperSheet";
import { BottomCTA, FadeIn, Header, IconButton, Screen, Sub, T } from "@/components/ui";
import { currentAnnouncements, matchAll, pickBest } from "@/data/announcements";
import { isComplete, NO_WORKPLACE, stepHint, stepLabel, stepOptions, stepTitle, visibleSteps, type Step } from "@/lib/onboarding";
import { searchPlaces, type PlaceHit } from "@/data/places-search";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space } from "@/theme/tokens";

/**
 * 조건 입력: 한 화면에 질문 하나, 하단 고정 CTA, 뒤로가기 자유.
 *
 * 두 가지로 쓴다.
 *  - 처음 가입: 모든 질문을 순서대로. `/onboarding`
 *  - 한 항목만 고치기: 그 질문 하나만 띄우고 저장하면 돌아간다. `/onboarding?step=annual_income`
 * 스무 개를 다 지나야 하나를 고칠 수 있으면 아무도 고치지 않는다.
 */
export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, setProfile } = useAppState();
  const { step: only } = useLocalSearchParams<{ step?: string }>();
  const [draft, setDraft] = useState<Partial<UserProfile>>(state.profile ?? {});
  const [index, setIndex] = useState(0);
  // 첫 온보딩은 핵심만 묻는다. 나머지는 공고를 보다가 필요해질 때 ?step=<id>로 그 자리에서 묻는다.
  const all = useMemo(() => visibleSteps(draft, { coreOnly: !only }), [draft, only]);
  // 한 항목만 고치는 중이면 그 단계만 남긴다. 없는 id를 받으면 평소대로 전부 보여 준다.
  const steps = useMemo(() => (only ? all.filter((x) => x.id === only) : all), [all, only]);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const value = step.read(draft);
  const [text, setText] = useState<string>(textFor(step, value));
  const [helper, setHelper] = useState(false);

  const go = (next: number, patch?: Partial<UserProfile>) => {
    const merged = patch ?? draft;
    // 한 항목만 고치는 중이면 저장하고 바로 돌아간다. 다음 질문으로 넘어가지 않는다.
    if (only) return saveOne(merged);
    const nextSteps = visibleSteps(merged, { coreOnly: !only });
    if (next >= nextSteps.length) return finish(merged);
    setDraft(merged);
    setIndex(next);
    const s = nextSteps[next]!;
    setText(textFor(s, s.read(merged)));
  };

  /**
   * 한 항목만 고쳤을 때. 온보딩을 마친 사람이므로 나머지 값은 이미 있다.
   * isComplete가 아니어도 저장한다 — 안 그러면 비어 있던 선택 항목을 채우다가 저장이 막힌다.
   */
  const saveOne = (edited: Partial<UserProfile>) => {
    const base: Partial<UserProfile> = state.profile ?? {};
    const merged: Partial<UserProfile> = { ...base, ...edited };
    if (isComplete(merged)) setProfile(merged, true);
    router.back();
  };

  const finish = (p: Partial<UserProfile>) => {
    if (!isComplete(p)) return;
    const profile: UserProfile = { ...p, subscription_deposits: p.subscription_deposits ?? p.subscription_months };
    setProfile(profile, true);
    // 결과는 홈 목록에서 먼저 보게 한다 (바로 상세로 가면 무엇을 본 건지 인지가 어렵다).
    // 로그인 게이트도 거기서 뜬다 — 조건에 맞는 공고가 몇 개인지 보여 준 다음이라야 가입을 물을 수 있다.
    router.replace("/(tabs)");
  };

  const numeric = step.kind === "won" || step.kind === "manwon" || step.kind === "count" || step.kind === "age" || step.kind === "months" || step.kind === "date";
  const isDuration = step.kind === "duration";
  const digits = text.replace(/[^0-9]/g, "");
  const duration = parseDuration(text);
  // 만원 칸은 사람이 만 원 단위로 치고 프로필에는 원으로 들어간다. 엔진·판정은 계속 원을 쓴다.
  const parsed = isDuration ? duration.total : numeric ? Number(digits) * (step.kind === "manwon" ? 10_000 : 1) : NaN;
  const dateOk = step.kind === "date" && isValidBirthDate(digits);
  const canNext = step.kind === "select" || step.kind === "place" ? value !== null : step.kind === "skip-info" || step.kind === "multi" ? true : step.kind === "date" ? dateOk : isDuration ? duration.years !== "" : text !== "" && Number.isFinite(parsed);
  const selected = step.kind === "multi" ? String(value ?? "").split(",").filter(Boolean) : [];

  const onNext = () => {
    if (step.kind === "select" || step.kind === "skip-info" || step.kind === "place") return go(index + 1);
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
      {only ? null : (
        <View style={{ height: 3, marginHorizontal: space.screen, borderRadius: 2, backgroundColor: colors.cardSoft, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${((index + 1) / steps.length) * 100}%`, backgroundColor: colors.primary }} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <FadeIn key={step.id} style={{ paddingHorizontal: space.screen, paddingTop: 32, gap: space.md }}>
          <Sub tone="3">{only ? stepLabel(step) : `${index + 1} / ${steps.length}`}</Sub>
          <T variant="title">{stepTitle(step, draft)}</T>
          {stepHint(step, draft) ? <T variant="body" color={colors.text2}>{stepHint(step, draft)}</T> : null}

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
                    {!grid ? <Icon name="check" size={20} color={on ? colors.primary : colors.line} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {step.kind === "place" && (
            <PlaceField
              value={value}
              onPick={(name, lat, lng) => setDraft((d) => step.apply(d, `${name}|${lat}|${lng}`))}
              noneLabel={options[0]?.label ?? "직장이 없어요"}
              noneHint={options[0]?.hint}
              onNone={() => setDraft((d) => step.apply(d, NO_WORKPLACE))}
            />
          )}

          {numeric && <NumberField step={step} text={text} onChange={setText} />}
          {isDuration && <DurationField text={text} onChange={setText} />}

          {step.helper ? (
            <Pressable onPress={() => setHelper(true)} accessibilityRole="button" style={({ pressed }) => ({ gap: 6, marginTop: 8, padding: 16, borderRadius: radius.md, backgroundColor: pressed ? colors.cardStrong : colors.cardSoft })}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T variant="bodyMedium" color={colors.primary}>건강보험료로 계산하기</T>
                <Icon name="right" size={18} color={colors.primary} />
              </View>
              <Sub tone="3">{step.helper}</Sub>
            </Pressable>
          ) : null}
        </FadeIn>
        </ScrollView>
        {/* CTA는 재어 둔 키보드 높이만큼 스스로 올라간다 (BottomCTA의 useKeyboardHeight).
            key로 단계마다 새로 만든다 — 그러지 않으면 다음 단계로 넘어갈 때 이전 버튼이
            퇴장 애니메이션을 하며 화면 한가운데 잠깐 남는다. 단계 전환은 즉시여야 한다. */}
        <BottomCTA
          key={step.id}
          label={only ? "저장" : index + 1 >= steps.length ? "내 조건으로 공고 찾기" : step.kind === "multi" && selected.length === 0 ? "해당 없음" : "다음"}
          onPress={onNext}
          appear={canNext}
          secondary={!!step.optional}
          secondaryLabel="나중에 입력할게요"
          onSecondary={onSkip}
        />
      </View>

      <IncomeHelperSheet visible={helper} dual={draft.income_type === "dual"} onClose={() => setHelper(false)} onApply={(v) => { setText(String(step.id === "annual_income" ? v * 12 : v)); setHelper(false); }} />
    </Screen>
  );
}

function NumberField({ step, text, onChange }: { step: Step; text: string; onChange: (t: string) => void }) {
  const { colors } = useTheme();
  const unit = { won: "원 / 월", manwon: "만 원", count: "명", age: "세", months: "개월", date: "" }[step.kind as "won" | "manwon" | "count" | "age" | "months" | "date"];
  // 단위는 그 칸이 무엇을 묻는지의 절반이다. 연소득 칸에 "원 / 월"이 붙어 있으면 자릿수를 틀리게 적는다.
  const byId: Record<string, string> = { marriage_years: "년", annual_income: "만 원 / 년", debt: "만 원 / 월" };
  const unitLabel = byId[step.id] ?? unit;
  const digits = text.replace(/[^0-9]/g, "");
  const isDate = step.kind === "date";
  const display = isDate ? formatDateDigits(digits) : text ? Number(digits).toLocaleString("ko-KR") : "";
  const valid = isDate && isValidBirthDate(digits);
  const ageNote = valid ? `만 ${ageFromBirthDate(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`)}세` : isDate ? "예: 1998.03.15" : "";
  const isWon = step.kind === "won" || step.kind === "manwon";
  // 치는 값이 만 원 단위라 "5,000"이 얼마인지 바로 안 보인다. 원으로 환산해 그 자리에 적는다.
  const won = step.kind === "manwon" ? Number(digits) * 10_000 : Number(digits);
  const manwon = isWon && digits ? summarizeWon(won) : "";
  // 연소득으로 받지만 공고의 소득 기준은 월이다. 판정에 쓰는 값을 그 자리에서 같이 보여 준다.
  const monthlyNote = step.id === "annual_income" && digits ? `월 ${summarizeWon(Math.round(won / 12))} 기준으로 판정해요` : "";
  return (
    <View style={{ gap: 10, marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 10, gap: 10 }}>
        <TextInput
          value={display}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, "").slice(0, isDate ? 8 : step.kind === "manwon" ? 7 : 15))}
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
        {digits ? <ClearButton onPress={() => onChange("")} /> : null}
      </View>
      {isDate ? <T variant="bodyMedium" color={valid ? colors.primary : colors.text3}>{ageNote}</T> : null}
      {isWon && manwon ? <T variant="bodyMedium" color={colors.primary}>{manwon}</T> : null}
      {monthlyNote ? <Sub tone="3">{monthlyNote}</Sub> : null}
    </View>
  );
}

/** 입력한 값을 한 번에 지운다. 긴 숫자를 백스페이스로 지우게 두지 않는다. */
function ClearButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="입력 지우기"
      style={({ pressed }) => ({ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.text3 : colors.text4, flexShrink: 0 })}>
      <Icon name="x" size={14} color={colors.surface} />
    </Pressable>
  );
}

/** 단계별 입력 문자열 초기값. duration은 "년:개월" 형식으로 들고 다닌다. */
function textFor(step: Step, value: string | number | null): string {
  if (value === null) return "";
  // 프로필에는 원으로 저장돼 있다. 만원 칸에 되돌려 넣을 때는 나눠서 보여 준다.
  if (step.kind === "manwon") return String(Math.round(Number(value) / 10_000));
  if (step.kind === "duration") {
    const m = Number(value);
    return `${Math.floor(m / 12)}:${m % 12 ? m % 12 : ""}`;
  }
  return String(value);
}

function parseDuration(text: string): { years: string; months: string; total: number } {
  const [y = "", m = ""] = text.split(":");
  const years = y.replace(/[^0-9]/g, "");
  const months = m.replace(/[^0-9]/g, "");
  return { years, months, total: Number(years || 0) * 12 + Number(months || 0) };
}

/** 기간 입력: 년(필수) + 개월(선택). 개월은 0~11로 자른다. */
function DurationField({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const { colors } = useTheme();
  const { years, months, total } = parseDuration(text);
  const inputStyle = [{ minWidth: 0, fontFamily: fonts.bold, fontSize: 36, lineHeight: 44, color: colors.text, padding: 0, letterSpacing: -1, fontVariant: ["tabular-nums"] as const }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null];
  const setMonths = (t: string) => {
    const d = t.replace(/[^0-9]/g, "").slice(0, 2);
    onChange(`${years}:${d === "" ? "" : String(Math.min(11, Number(d)))}`);
  };
  return (
    <View style={{ gap: 10, marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16 }}>
        <View style={{ flex: 3, flexDirection: "row", alignItems: "baseline", gap: 8, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 10 }}>
          <TextInput value={years} onChangeText={(t) => onChange(`${t.replace(/[^0-9]/g, "").slice(0, 3)}:${months}`)} keyboardType="number-pad" autoFocus placeholder="0" placeholderTextColor={colors.line} numberOfLines={1} selectionColor={colors.primary} accessibilityLabel="무주택 기간 (년)" style={[{ flex: 1 }, ...inputStyle]} />
          <T variant="subheading" color={colors.text2} style={{ flexShrink: 0 }}>년</T>
          {years ? <ClearButton onPress={() => onChange(`:${months}`)} /> : null}
        </View>
        <View style={{ flex: 2, flexDirection: "row", alignItems: "baseline", gap: 8, borderBottomWidth: 2, borderBottomColor: months ? colors.primary : colors.line, paddingBottom: 10 }}>
          <TextInput value={months} onChangeText={setMonths} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.line} numberOfLines={1} selectionColor={colors.primary} accessibilityLabel="무주택 기간 (개월, 선택)" style={[{ flex: 1 }, ...inputStyle]} />
          <T variant="subheading" color={colors.text2} style={{ flexShrink: 0 }}>개월</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T variant="bodyMedium" color={years ? colors.primary : colors.text3}>{years ? `총 ${total}개월` : "년 수만 적어도 돼요"}</T>
        <Sub tone="3">개월은 선택</Sub>
      </View>
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

/**
 * 직장 위치 검색. 역·회사·건물 이름을 치면 좌표가 나온다.
 *
 * 시군구 선택을 대신한다 — 구청 좌표로는 통근 시간이 실제와 몇 십 분씩 어긋났다.
 * 검색은 Edge Function을 거친다 (`data/places-search.ts`). 검색어는 어디에도 저장되지 않는다.
 */
function PlaceField({
  value,
  onPick,
  noneLabel,
  noneHint,
  onNone,
}: {
  value: string | number | null;
  onPick: (name: string, lat: number, lng: number) => void;
  noneLabel: string;
  noneHint?: string;
  onNone: () => void;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const none = value === NO_WORKPLACE;
  // 이미 고른 장소가 있으면 "이름|위도|경도"로 들어온다
  const picked = typeof value === "string" && value !== NO_WORKPLACE ? value.split("|")[0] : null;

  // 한 글자씩 부르면 호출만 쓴다. 타자가 멎고 300ms 뒤에 한 번 부른다.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      void searchPlaces(term).then((r) => {
        if (!alive) return;
        setHits(r);
        setBusy(false);
        setSearched(true);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {picked ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
          <Icon name="check" size={18} color={colors.primary} />
          <T variant="bodyMedium" color={colors.primary} style={{ flex: 1 }}>{picked}</T>
        </View>
      ) : null}

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="예: 강남역, 판교 카카오, 삼성전자 수원"
        placeholderTextColor={colors.text4}
        autoCorrect={false}
        style={{ fontFamily: fonts.medium, fontSize: 17, color: colors.text, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 16 }}
      />

      {busy ? <Sub tone="3">찾는 중…</Sub> : null}
      {!busy && searched && hits.length === 0 ? (
        <Sub tone="3">찾는 곳이 없어요. 역 이름이나 회사 이름으로 다시 쳐 보세요.</Sub>
      ) : null}

      {hits.map((h) => (
        <Pressable
          key={`${h.name}|${h.lat}|${h.lng}`}
          onPress={() => onPick(h.name, h.lat, h.lng)}
          accessibilityRole="button"
          accessibilityLabel={h.name}
          style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.md, backgroundColor: pressed ? colors.cardStrong : colors.card, gap: 2 })}
        >
          <T variant="bodyMedium">{h.name}</T>
          {h.address ? <Sub tone="3">{h.address}</Sub> : null}
        </Pressable>
      ))}

      {/* 직장이 없는 사람도 있다. 건너뛰기와 다른 답이라 따로 둔다. */}
      <Pressable
        onPress={onNone}
        accessibilityRole="button"
        accessibilityState={{ selected: none }}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 16, borderRadius: radius.md, backgroundColor: none ? colors.primarySoft : pressed ? colors.cardStrong : colors.cardSoft })}
      >
        <View style={{ gap: 2 }}>
          <T variant="bodyMedium" color={none ? colors.primary : colors.text}>{noneLabel}</T>
          {noneHint ? <Sub tone="3">{noneHint}</Sub> : null}
        </View>
        <Icon name="check" size={20} color={none ? colors.primary : colors.line} />
      </Pressable>
    </View>
  );
}
