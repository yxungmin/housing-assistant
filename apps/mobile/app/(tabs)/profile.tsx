import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { ageFromBirthDate } from "@housing/engine";
import { Icon } from "@/components/Icon";
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

      <Card onPress={() => router.push("/onboarding")} style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T variant="heading">내 조건</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Sub tone="3">수정</Sub>
            <Icon name="right" size={16} color={colors.text3} />
          </View>
        </View>
        {p ? (
          <View style={{ gap: 4 }}>
            <T variant="body">{age} · {p.household_size}인 가구 · {MARRIAGE[p.marriage ?? ""]}{p.income_type === "dual" ? " 맞벌이" : ""} · {REGIONS.find((r) => r.value === p.region_code)?.label}</T>
            <T variant="body" color={colors.text2}>월 소득 {manwon(p.monthly_income)} · 자산 {manwon(p.total_assets)} · 현금 {manwon(p.cash_on_hand)}</T>
            <T variant="body" color={colors.text2}>{p.is_homeless ? `무주택 ${Math.floor((p.homeless_months ?? 0) / 12)}년` : "유주택"} · 청약통장 {p.subscription_months ?? 0}개월</T>
          </View>
        ) : (
          <Sub>아직 조건을 입력하지 않았어요.</Sub>
        )}
        {missing.length > 0 ? <Sub tone="3">아직 입력하지 않은 항목: {missing.join(", ")}. 입력하면 "확인 필요"였던 조건이 판별돼요.</Sub> : null}
      </Card>

      <SectionTitle>구독</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow first label="상태" value={sub.status === "trial" ? <Tag>체험 중 · {longDate(sub.expiresAt?.slice(0, 10))}까지</Tag> : sub.status === "active" ? <Tag>구독 중</Tag> : <Tag tone="gray">미구독 · 첫 1건 무료</Tag>} />
        <ListRow label="다음 결제" value={sub.status === "trial" ? `${longDate(sub.expiresAt?.slice(0, 10))} · 월 2,900원` : "-"} />
        <ListRow label="구독 복원 · 해지" value="스토어 연결 후" onPress={() => {}} />
      </Card>

      <SectionTitle>설정</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <ListRow first label="대출 금리 기준일" value={longDate(LOAN_AS_OF)} />
        <View style={{ paddingVertical: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
          <T variant="bodyMedium">화면 모드</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["system", "light", "dark"] as ThemePref[]).map((m) => (
              <Chip key={m} on={state.themePref === m} onPress={() => setTheme(m)}>{{ system: "시스템 설정", light: "라이트", dark: "다크" }[m]}</Chip>
            ))}
          </View>
        </View>
        <ListRow label="알림" value="신규 공고 · 마감 D-3" onPress={() => {}} />
        <ListRow label="이 숫자 이상해요 (신고 내역)" value="0건" onPress={() => {}} />
      </Card>

      <Sub tone="3" style={{ paddingTop: 4 }}>입력한 조건은 이 기기에만 저장되고 서버로 보내지 않아요.</Sub>
      <Pressable onPress={reset} accessibilityRole="button" style={{ paddingVertical: 12 }}>
        <T variant="small" color={colors.text3}>모든 데이터 지우고 처음부터</T>
      </Pressable>
    </Screen>
  );
}
