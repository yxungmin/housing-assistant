import { useState } from "react";
import { Pressable, View } from "react-native";
import { usePathname } from "expo-router";
import { ConsentChecks } from "./SignIn";
import { BottomSheet, PrimaryButton, Sub, T } from "./ui";
import { consentReady, needsTermsConsent, type ConsentValue } from "@/lib/consent";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * 약관이 바뀌었거나(TERMS_VERSION이 올라감) 동의 기록이 없는 계정에게 한 번 받는다.
 *
 * 닫기로 넘어가게 두지 않는다 — 넘어가면 바뀐 약관이 계약 내용이 되지 않는다.
 * 대신 빠져나갈 길을 둔다: 동의하지 않으면 로그아웃할 수 있다(조건·저장 목록은 기기에 남는다).
 * 계정 삭제는 여기서 권하지 않는다 — 되돌릴 수 없는 버튼을 동의 화면 옆에 두지 않는다. 내 정보에 있다.
 *
 * 약관·처리방침을 읽는 동안에는 숨는다. 시트가 그 위에 떠 있으면 무엇에 동의하는지 읽을 수 없다.
 */
export function TermsUpdateSheet() {
  const { colors } = useTheme();
  const { state, agreeTerms, signOut } = useAppState();
  const path = usePathname();
  const [checks, setChecks] = useState<ConsentValue>({ age: false, terms: false });
  const visible = state.loaded && needsTermsConsent(state.account) && !path.startsWith("/legal");
  const changed = !!state.account?.consent;

  return (
    <BottomSheet visible={visible} onClose={() => {}}>
      <View style={{ gap: 6 }}>
        <T variant="title">{changed ? "이용약관이 바뀌었어요" : "이용약관을 확인해 주세요"}</T>
        <Sub variant="body">
          {changed
            ? "계속 쓰려면 바뀐 약관에 동의해 주세요. 무엇이 바뀌었는지는 약관 보기에서 확인할 수 있어요."
            : "계정을 계속 쓰려면 약관 동의가 필요해요."}
        </Sub>
      </View>
      <ConsentChecks value={checks} onChange={setChecks} />
      <PrimaryButton label="동의하고 계속" disabled={!consentReady(checks)} onPress={agreeTerms} />
      <Pressable onPress={() => void signOut()} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 8 }}>
        <T variant="small" color={colors.text3}>동의하지 않고 로그아웃</T>
      </Pressable>
      <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
        로그아웃해도 적어 두신 조건과 저장한 공고는 이 기기에 남아요.
      </Sub>
    </BottomSheet>
  );
}
