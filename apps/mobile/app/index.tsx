import { Redirect, useRouter } from "expo-router";
import { View } from "react-native";
import { BottomCTA, Logo, Screen, Sub, T } from "@/components/ui";
import { useAppState } from "@/store/appState";
import { space } from "@/theme/tokens";

/** 시작: 한 줄 가치 제안 + 시작하기. 로그인 없음. */
export default function Start() {
  const { state } = useAppState();
  const router = useRouter();
  if (state.onboarded && state.profile) return <Redirect href="/(tabs)" />;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", gap: space.xl, paddingBottom: 96 }}>
        <Logo size={64} />
        <T variant="display">내 조건에 맞는{"\n"}공공주택 공고만{"\n"}보여드릴게요</T>
        <Sub variant="body" style={{ maxWidth: 320 }}>
          나이·소득·자산을 입력하면 LH 공고 중 조건이 맞는 것과 예상 주거비를 바로 계산해요. 입력한 정보는 이 기기에만 저장됩니다.
        </Sub>
      </View>
      <BottomCTA label="시작하기" onPress={() => router.push("/onboarding")} secondary secondaryLabel="로그인 없이 바로 시작합니다" onSecondary={() => router.push("/onboarding")} />
    </Screen>
  );
}
