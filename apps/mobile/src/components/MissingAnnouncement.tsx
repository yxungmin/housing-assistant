import { useEffect, useState } from "react";
import { goBackOrHome } from "@/lib/nav";
import { tileSize } from "@/theme/tokens";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useAnnouncements } from "@/data/announcements";
import { remoteConfigured } from "@/data/remote";
import { Header, IconTile, PrimaryButton, Screen, Sub, T } from "./ui";
import { useTheme } from "@/theme/ThemeProvider";

/** 서버 목록을 기다리는 최대 시간. 넘으면 못 찾은 것으로 본다 — 끝없는 로딩은 막다른 화면과 다르지 않다 */
const WAIT_MS = 6000;

/**
 * 열려는 공고가 목록에 없을 때.
 *
 * 전에는 제목 한 줄만 있고 뒤로 가기도 설명도 없었다. 이 화면에 오는 길은 대개 둘이다:
 *  1. 알림을 눌렀는데 공고가 목록에서 내려갔다 — 서버 뷰는 마감 7일 뒤에 공고를 내린다.
 *  2. 앱을 막 켰는데 아직 서버 목록이 안 왔다 — 번들·캐시에는 없는 새 공고다.
 * 2번을 "없어요"라고 하면 거짓말이 되므로 잠깐 기다리고, 그래도 없으면 1번으로 말한다.
 * 어느 쪽이든 나갈 길(뒤로·홈)은 늘 있어야 한다.
 */
export function MissingAnnouncement() {
  const router = useRouter();
  const { colors } = useTheme();
  const { source } = useAnnouncements();
  const syncing = remoteConfigured && source !== "remote";
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!syncing) return;
    const t = setTimeout(() => setGaveUp(true), WAIT_MS);
    return () => clearTimeout(t);
  }, [syncing]);

  const back = () => goBackOrHome(router);
  const header = <Header onBack={back} />;

  if (syncing && !gaveUp) {
    return (
      <Screen header={header}>
        <View style={{ alignItems: "center", paddingTop: 80, gap: 14 }}>
          <ActivityIndicator color={colors.text3} />
          <Sub tone="3">공고를 불러오고 있어요</Sub>
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <View style={{ alignItems: "center", paddingTop: 48, gap: 12 }}>
        <IconTile name="notice" size={tileSize.xl} />
        <T variant="heading" style={{ textAlign: "center" }}>
          지금은 볼 수 없는 공고예요
        </T>
        <Sub style={{ textAlign: "center" }}>
          접수가 끝나고 일주일이 지나면 목록에서 내려가요.{"\n"}
          {syncing ? "인터넷 연결이 불안정하면 새 공고가 늦게 보일 수도 있어요." : "관심 공고였다면 기관 사이트에서 결과를 확인해 주세요."}
        </Sub>
      </View>
      <View style={{ paddingTop: 28 }}>
        <PrimaryButton label="홈으로 가기" onPress={() => router.replace("/(tabs)")} />
      </View>
    </Screen>
  );
}
