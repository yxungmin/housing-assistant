import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { ageFromBirthDate } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { Card, Chip, Divider, Row, Screen, Sub, T, Tag } from "@/components/ui";
import { LOAN_AS_OF } from "@/data/loans";
import { longDate, manwon, won } from "@/lib/format";
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

  return (
    <Screen>
      <T variant="title" style={{ paddingTop: 14 }}>내 정보</T>

      <Card onPress={() => router.push("/onboarding")}>
        <Row>
          <T variant="heading">내 조건</T>
          <Sub>수정은 항상 무료</Sub>
        </Row>
        {p ? (
          <Sub>
            {p.birth_date ? `${p.birth_date.slice(0, 4)}년생 (만 ${ageFromBirthDate(p.birth_date)}세)` : `만 ${p.age}세`} · {p.household_size}인 · {MARRIAGE[p.marriage ?? ""]}{p.income_type === "dual" ? " 맞벌이" : ""} · {REGIONS.find((r) => r.value === p.region_code)?.label}
            {"\n"}월 {manwon(p.monthly_income)} · 자산 {manwon(p.total_assets)} · {p.is_homeless ? `무주택 ${Math.floor((p.homeless_months ?? 0) / 12)}년` : "유주택"} · 현금 {manwon(p.cash_on_hand)}
          </Sub>
        ) : (
          <Sub>아직 조건을 입력하지 않았어요.</Sub>
        )}
        {missing.length > 0 && (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Icon name="alert" size={14} color={colors.warning} />
            <Sub style={{ flex: 1 }}>아직 입력하지 않은 항목: {missing.join(", ")}. 입력하면 "확인 필요"였던 조건이 판별돼요.</Sub>
          </View>
        )}
      </Card>

      <Card>
        <Row>
          <T variant="bodyMedium">구독</T>
          {sub.status === "trial" ? <Tag>체험 중 · {longDate(sub.expiresAt?.slice(0, 10))}까지 무료</Tag>
            : sub.status === "active" ? <Tag>구독 중</Tag>
            : <Tag tone="gray">미구독 · 첫 1건 무료</Tag>}
        </Row>
        <Divider />
        <Row><T variant="bodyMedium">다음 결제</T><Sub>{sub.status === "trial" ? `${longDate(sub.expiresAt?.slice(0, 10))} · 월 2,900원` : "-"}</Sub></Row>
        <Divider />
        <Row><T variant="bodyMedium">구독 복원 · 해지</T><Sub>스토어 연결 후 (M8)</Sub></Row>
      </Card>

      <Card>
        <Row><T variant="bodyMedium">대출 금리 기준일</T><Sub>{longDate(LOAN_AS_OF)}</Sub></Row>
        <Divider />
        <View style={{ gap: 8 }}>
          <T variant="bodyMedium">화면 모드</T>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["system", "light", "dark"] as ThemePref[]).map((m) => (
              <Chip key={m} on={state.themePref === m} onPress={() => setTheme(m)}>{{ system: "시스템 설정", light: "라이트", dark: "다크" }[m]}</Chip>
            ))}
          </View>
        </View>
        <Divider />
        <Row><T variant="bodyMedium">알림</T><Sub>신규 공고 · 마감 D-3 (M7)</Sub></Row>
        <Divider />
        <Row><T variant="bodyMedium">이 숫자 이상해요 (신고 내역)</T><Sub>0건</Sub></Row>
      </Card>

      <Sub>입력한 조건은 이 기기에만 저장되고 서버로 보내지 않아요.</Sub>
      <Pressable onPress={reset} accessibilityRole="button" style={{ paddingVertical: 10 }}>
        <Sub style={{ color: colors.danger }}>모든 데이터 지우고 처음부터 (개발용)</Sub>
      </Pressable>
      {p && <Sub style={{ opacity: 0.6 }}>보유 현금 {won(p.cash_on_hand)} · 청약통장 {p.subscription_months ?? 0}개월</Sub>}
    </Screen>
  );
}
