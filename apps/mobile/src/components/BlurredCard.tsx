import { View } from "react-native";
import { Card, Sub, T, Tag } from "./ui";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";

/**
 * 가려진 공고 카드.
 *
 * 제목만 가리고 **상태와 마감은 그대로 보여 준다** — 가려진 것이 비어 있지 않다는 증거가 있어야
 * 블러가 통행료가 아니라 궁금증이 된다. 공고문에 그대로 있는 값을 가리면 그건 공공정보를
 * 인질로 잡는 것이라, 이 카드는 "무엇이 있는지"만 가린다.
 *
 * 실제 블러(expo-blur) 대신 회색 막대를 쓴다. 블러는 가린 글자를 복원할 여지를 남기고,
 * 안드로이드에서 성능이 고르지 않다. 막대는 애초에 아무 정보도 담지 않는다.
 */
export function BlurredCard({ status, dday, settled }: { status: string; dday?: string; /** 확인 필요가 없어 초록 체크를 붙여도 되는가 */ settled?: boolean }) {
  const { colors } = useTheme();
  const bar = (w: number | string, h = 16) => (
    <View style={{ width: w as number, height: h, borderRadius: 6, backgroundColor: colors.cardStrong }} />
  );

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        {bar(96, 12)}
        {dday ? <T variant="label" color={colors.text3} style={{ fontFamily: fonts.bold }}>{dday}</T> : null}
      </View>
      <View style={{ gap: 8 }}>
        {bar(220, 18)}
        {bar(140, 18)}
      </View>
      <View style={{ flexDirection: "row" }}>
        {/* 목록 카드와 같은 규칙. 확인 필요가 남았으면 초록 체크를 붙이지 않는다 */}
        <Tag tone={settled ? "primary" : "gray"} icon={settled ? "check" : "info"}>{status}</Tag>
      </View>
      <Sub tone="3" variant="caption">로그인하면 어떤 공고인지 볼 수 있어요</Sub>
    </Card>
  );
}
