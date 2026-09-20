import { View } from "react-native";
import { Icon } from "./Icon";
import { BottomSheet, Card, Row, Sub, T, Tag } from "./ui";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius } from "@/theme/tokens";
import { Pressable, Text } from "react-native";

/**
 * 구독 시트: 첫 무료 계산을 본 뒤에 처음 뜬다. 7일 무료 체험 후 월 2,900원.
 * M8 전까지 스토어 결제 없이 로컬 목(mock)으로 체험 상태만 만든다.
 */
export function SubscriptionSheet({ visible, onClose, onStarted }: { visible: boolean; onClose: () => void; onStarted?: () => void }) {
  const { colors } = useTheme();
  const { setSubscription } = useAppState();

  const start = () => {
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
    setSubscription({ status: "trial", expiresAt: expires });
    onStarted?.();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <T variant="title">다른 공고의 주거비도{"\n"}계산해 볼까요?</T>
      <Sub>첫 공고 1건은 무료로 계산해 드렸어요. 이어서 보려면 구독이 필요해요.</Sub>
      {["모든 공고의 필요 현금·월 주거비 계산", "보증금·월세 시나리오와 대출 상품 비교", "수정 공고가 나오면 자동 재계산"].map((b) => (
        <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
            <Icon name="check" size={12} color={colors.primary} strokeWidth={2.8} />
          </View>
          <T variant="body" style={{ flex: 1 }}>{b}</T>
        </View>
      ))}
      <Card>
        <Row>
          <View>
            <T variant="heading">7일 무료 체험</T>
            <Sub>체험이 끝나면 <T variant="small" numeric style={{ fontSize: 16 }}>월 2,900원</T></Sub>
          </View>
          <Tag>언제든 해지</Tag>
        </Row>
      </Card>
      <Pressable onPress={start} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1, borderRadius: radius.lg - 2, paddingVertical: 15, alignItems: "center" })}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.onPrimary }}>무료 체험 시작</Text>
      </Pressable>
      <Sub style={{ textAlign: "center" }}>Google 계정으로 로그인 후 스토어 결제로 진행돼요 · 구독 복원{"\n"}(개발 빌드: 결제 없이 체험 상태만 켜집니다)</Sub>
    </BottomSheet>
  );
}
