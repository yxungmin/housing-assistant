import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Header, Notice, Screen, Sub, T } from "@/components/ui";
import { bulletText, isBullet, isDraft, LEGAL_DOCS } from "@/legal";
import { longDate } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * 약관·개인정보처리방침 화면.
 *
 * 본문은 `src/legal`이 원본이고 웹에 올리는 md도 거기서 나온다 — 두 벌을 손으로 맞추면
 * 반드시 어긋나고, 이 문서에서 어긋남은 오타가 아니라 위법 사실의 증거가 된다.
 *
 * 아직 빈칸이 남았으면 화면 맨 위에 그렇게 적는다. 초안을 확정본처럼 보여 주는 것이
 * 아무것도 안 보여 주는 것보다 나쁘다 — 사용자는 읽고 믿을 텐데 우리는 지킬 수 없다.
 */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const legal = doc === "privacy" || doc === "terms" ? LEGAL_DOCS[doc] : null;

  if (!legal) {
    return (
      <Screen header={<Header onBack={() => router.back()} title="문서" />}>
        <Sub>문서를 찾지 못했어요.</Sub>
      </Screen>
    );
  }

  // 헤더에 제목을 또 넣지 않는다 — 바로 아래 큰 제목과 겹쳐 같은 말이 두 번 나온다
  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <View style={{ gap: 6, paddingTop: 8 }}>
        <T variant="title">{legal.title}</T>
        <Sub tone="3" variant="caption">
          {legal.effectiveAt ? `시행일 ${longDate(legal.effectiveAt)}` : "아직 시행 전 초안이에요"}
        </Sub>
      </View>

      {isDraft(legal) ? (
        <Notice tone="warn" icon="alert">
          작성 중인 초안이에요. 아직 채우지 못한 항목이 있어 확정된 내용이 아니에요
          {legal.blanks.length > 0 ? ` (${legal.blanks.length}건)` : ""}.
        </Notice>
      ) : null}

      {legal.intro?.map((p, i) => (
        <T key={i} variant="body" color={colors.text2}>{p}</T>
      ))}

      <View style={{ gap: 24 }}>
        {legal.sections.map((s) => (
          <View key={s.heading} style={{ gap: 8 }}>
            <T variant="bodyMedium">{s.heading}</T>
            {s.body.map((line, i) =>
              isBullet(line) ? (
                <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                  <T variant="body" color={colors.text3}>·</T>
                  <T variant="body" color={colors.text2} style={{ flex: 1 }}>{bulletText(line)}</T>
                </View>
              ) : (
                <T key={i} variant="body" color={colors.text2}>{line}</T>
              ),
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}
