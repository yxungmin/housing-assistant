import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { ageFromBirthDate, monthsBetween } from "@housing/engine";
import { Card, Chip, ListRow, PageTitle, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { LOAN_AS_OF } from "@/data/loans";
import { longDate, manwon } from "@/lib/format";
import { REGIONS } from "@/lib/onboarding";
import { useAppState, type ThemePref } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";

const MARRIAGE: Record<string, string> = { single: "미혼", married: "기혼", pre_marriage: "예비 신혼부부", single_parent: "한부모" };

/** 내 정보: 조건 수정(항상 무료), 구독 상태, 대출 기준일, 화면 모드 */
export default function Profile() {
  const { state, setTheme, reset } = useAppState();
  const { colors } = useTheme();
  const router = useRouter();
  const p = state.profile;
  const missing: string[] = [];
  if (p?.car_value === undefined) missing.push("자동차가액");
  if (p?.monthly_debt_payment === undefined) missing.push("월 부채 상환액");
  if (!p?.workplace) missing.push("직장 위치");
  const sub = state.subscription;
  const age = p?.birth_date ? `${p.birth_date.slice(0, 4)}년생 · 만 ${ageFromBirthDate(p.birth_date)}세` : p?.age !== undefined ? `만 ${p.age}세` : "";

  return (
    <Screen>
      <PageTitle title="내 정보" />

      <Card onPress={() => router.push("/onboarding")} style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T variant="subheading">내 조건</T>
          <Tag tone="gray">수정</Tag>
        </View>
        {p ? (
          <View style={{ gap: 6 }}>
            <T variant="bodyMedium">{age} · {p.household_size}인 가구 · {MARRIAGE[p.marriage ?? ""]}{p.income_type === "dual" ? " 맞벌이" : ""} · {p.region_sigungu ?? REGIONS.find((r) => r.value === p.region_code)?.label}</T>
            <Sub>월 소득 {manwon(p.monthly_income)} · 자산 {manwon(p.total_assets)} · 현금 {manwon(p.cash_on_hand)}</Sub>
            <Sub>{p.is_homeless ? `무주택 ${Math.floor((p.homeless_months ?? 0) / 12)}년` : "유주택"} · 청약통장 {(p.subscription_months ?? 0) + (p.subscription_active && p.subscription_as_of ? monthsBetween(p.subscription_as_of) : 0)}개월{p.subscription_active ? " (납입 중)" : ""}</Sub>
          </View>
        ) : (
          <Sub>아직 조건을 입력하지 않았어요.</Sub>
        )}
        {missing.length > 0 ? <Sub tone="3" variant="caption">아직 입력하지 않은 항목: {missing.join(", ")}. 입력하면 "확인 필요"였던 조건이 판별돼요.</Sub> : null}
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>구독</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          <ListRow icon="check" iconTone={sub.status === "none" ? "gray" : "primary"} label={sub.status === "trial" ? "무료 체험 중" : sub.status === "active" ? "구독 중" : "미구독"} sub={sub.status === "trial" ? `${longDate(sub.expiresAt?.slice(0, 10))}까지 무료 · 이후 월 2,900원` : sub.status === "active" ? "월 2,900원" : "첫 공고 1건은 무료로 계산할 수 있어요"} />
          <ListRow icon="more" label="구독 복원 · 해지" sub="스토어 연결 후 열립니다" onPress={() => {}} />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>설정</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          <ListRow icon="info" label="대출 금리 기준일" value={longDate(LOAN_AS_OF)} />
          <ListRow icon="bell" label="알림" sub="신규 공고 · 관심 공고 마감 3일 전" onPress={() => {}} />
          <ListRow icon="alert" label="이 숫자 이상해요" sub="신고 내역 0건" onPress={() => {}} />
          <View style={{ paddingVertical: 12, paddingHorizontal: 4, gap: 12 }}>
            <T variant="bodyMedium">화면 모드</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["system", "light", "dark"] as ThemePref[]).map((m) => (
                <Chip key={m} on={state.themePref === m} onPress={() => setTheme(m)}>{{ system: "시스템 설정", light: "라이트", dark: "다크" }[m]}</Chip>
              ))}
            </View>
          </View>
        </Card>
      </View>

      <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>입력한 조건은 이 기기에만 저장되고 서버로 보내지 않아요.</Sub>
      <Pressable onPress={reset} accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 4 }}>
        <T variant="small" color={colors.text3}>모든 데이터 지우고 처음부터</T>
      </Pressable>
    </Screen>
  );
}
