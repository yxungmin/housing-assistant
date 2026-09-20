import { useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { HEALTH_INSURANCE, incomeFromPremium } from "@housing/engine";
import { BottomSheet, Notice, PrimaryButton, Sub, T } from "./ui";
import { manwon } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";

/**
 * 소득 입력 도우미: 급여명세서의 건강보험료(본인부담)로 세전 월소득을 역산한다.
 * 계산은 엔진(incomeFromPremium)에서, 요율·기준일도 거기서 받아 화면에 적는다.
 */
export function IncomeHelperSheet({ visible, dual, onClose, onApply }: { visible: boolean; dual: boolean; onClose: () => void; onApply: (monthlyIncome: number) => void }) {
  const { colors } = useTheme();
  const [mine, setMine] = useState("");
  const [spouse, setSpouse] = useState("");
  const n = (s: string) => Number(s.replace(/[^0-9]/g, "") || 0);
  const result = incomeFromPremium({ premium: n(mine), spouse_premium: dual ? n(spouse) : undefined });
  const ok = result.monthly_income > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: 8 }}>
        <T variant="title">건강보험료로{"\n"}소득 계산하기</T>
        <T variant="body" color={colors.text2}>급여명세서의 "건강보험료" 금액을 적어 주세요. 장기요양보험료는 빼고, 직장가입자만 계산할 수 있어요.</T>
      </View>
      <View style={{ gap: 20 }}>
        <PremiumField label={dual ? "내 건강보험료" : "건강보험료 (월)"} value={mine} onChange={setMine} autoFocus />
        {dual ? <PremiumField label="배우자 건강보험료" value={spouse} onChange={setSpouse} /> : null}
      </View>
      {ok ? (
        <View style={{ gap: 4 }}>
          <Sub>세전 가구 월소득 추정</Sub>
          <T variant="heading" numeric style={{ fontSize: 28 }}>{manwon(result.monthly_income)}</T>
          <Sub tone="3" variant="caption">건강보험료 ÷ (보험료율 {(result.rate * 100).toFixed(2)}% ÷ 2) · {HEALTH_INSURANCE.year}년 요율 기준</Sub>
        </View>
      ) : (
        <Notice tone="info" icon="info">지역가입자는 소득 외 요소로 보험료가 정해져 역산할 수 없어요. 소득금액증명의 금액을 12로 나눠 적어 주세요.</Notice>
      )}
      <PrimaryButton label={ok ? `${manwon(result.monthly_income)}으로 입력` : "금액을 입력해 주세요"} disabled={!ok} onPress={() => onApply(result.monthly_income)} />
    </BottomSheet>
  );
}

function PremiumField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const { colors } = useTheme();
  const digits = value.replace(/[^0-9]/g, "");
  return (
    <View style={{ gap: 6 }}>
      <Sub>{label}</Sub>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 8 }}>
        <TextInput
          value={digits ? Number(digits).toLocaleString("ko-KR") : ""}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, "").slice(0, 9))}
          keyboardType="number-pad"
          autoFocus={autoFocus}
          placeholder="0"
          placeholderTextColor={colors.line}
          numberOfLines={1}
          selectionColor={colors.primary}
          accessibilityLabel={label}
          style={[{ flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, color: colors.text, padding: 0, letterSpacing: -0.5, fontVariant: ["tabular-nums"] }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
        />
        <T variant="bodyMedium" color={colors.text2} style={{ flexShrink: 0 }}>원</T>
      </View>
    </View>
  );
}
