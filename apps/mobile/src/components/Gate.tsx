import { View } from "react-native";
import { BILLING_DISCLOSURE, PRICE_KRW } from "@/lib/billing";
import { BlurredCard } from "./BlurredCard";
import { Card, PrimaryButton, Screen, SectionTitle, Sub, T } from "./ui";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/**
 * 로그인 게이트 / 만료 화면.
 *
 * 가려진 게 비어 있지 않다는 증거를 먼저 준다 — 개수와 가장 빠른 마감은 그대로 보여 주고
 * 제목만 가린다. 그래야 블러가 통행료가 아니라 궁금증이 된다.
 * 맞는 공고가 0개일 때 이 화면을 띄우면 안 된다 (`shouldGate`가 막는다).
 */
export function Gate({
  mode,
  count,
  soonestDday,
  samples,
  busy,
  onPrimary,
}: {
  mode: "signIn" | "expired";
  /** 조건에 맞는 공고 수. 가려진 것이 비어 있지 않다는 증거다 */
  count: number;
  /** "D-9" 같은 문구. 없으면 생략 */
  soonestDday?: string;
  /** 가려서 보여 줄 카드들의 실제 상태 문구 ("조건 8개 중 7개 일치") */
  samples: { status: string; dday?: string }[];
  busy?: boolean;
  onPrimary: () => void;
}) {
  const { colors } = useTheme();
  const signIn = mode === "signIn";

  return (
    <Screen>
      <View style={{ gap: 10, paddingTop: 28 }}>
        <T variant="display" style={{ fontSize: 30, lineHeight: 42 }}>
          {signIn ? `조건에 맞는 공고를\n${count}개 찾았어요` : "구독이 끝났어요"}
        </T>
        <Sub variant="body">
          {signIn
            ? "로그인하면 바로 볼 수 있어요."
            : `조건에 맞는 새 공고가 ${count}개 올라왔어요.${soonestDday ? ` 가장 빠른 마감은 ${soonestDday}이에요.` : ""}`}
        </Sub>
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle>{signIn ? "내 조건에 맞는 공고" : "새로 올라온 공고"}</SectionTitle>
        {samples.map((s, i) => (
          <BlurredCard key={i} status={s.status} dday={s.dday} />
        ))}
        {count > samples.length ? (
          <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>외 {count - samples.length}개</Sub>
        ) : null}
      </View>

      <View style={{ gap: 10, paddingTop: space.sm }}>
        <PrimaryButton
          label={busy ? "처리 중" : signIn ? "카카오로 로그인" : `다시 구독하기 · 월 ${PRICE_KRW.toLocaleString("ko-KR")}원`}
          disabled={busy}
          onPress={onPrimary}
        />
        {/* 고지는 구매 버튼 바로 위·아래에 둔다. 아래에 작게 깔면 App Store 심사에서 걸린다 */}
        <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>{BILLING_DISCLOSURE}</Sub>
        <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
          {signIn ? "입력하신 조건은 이 기기에만 저장돼요." : "저장한 공고와 마감 알림은 그대로 쓸 수 있어요."}
        </Sub>
      </View>

      {!signIn ? (
        <Card style={{ gap: 4 }}>
          <T variant="bodyMedium">저장한 공고는 계속 볼 수 있어요</T>
          <Sub tone="3" variant="caption">
            저장해 둔 공고는 그대로 열리고, 알림을 켜 두었다면 마감 3일 전 알림도 그대로 갑니다. 구독과 무관하게 마감을 놓치게 하지 않아요.
          </Sub>
        </Card>
      ) : null}

      <View style={{ height: 1, backgroundColor: colors.line, opacity: 0 }} />
    </Screen>
  );
}
