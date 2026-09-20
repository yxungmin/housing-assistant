import { useMemo } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { Card, Screen, Sub, T } from "@/components/ui";
import { matchAll } from "@/data/announcements";
import { daysUntil, longDate } from "@/lib/format";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { AnnouncementCard } from "./index";

/** 관심 공고: D-day 순. 마감 D-3 알림은 기기 예약 알림(M7)으로 붙는다. */
export default function Saved() {
  const { state } = useAppState();
  const { colors } = useTheme();
  const router = useRouter();
  const items = useMemo(
    () =>
      matchAll(state.profile)
        .filter((m) => state.saved.includes(m.announcement.id))
        .sort((a, b) => (daysUntil(a.announcement.apply_end) ?? 999) - (daysUntil(b.announcement.apply_end) ?? 999)),
    [state.profile, state.saved],
  );
  const nearest = items.find((m) => {
    const d = daysUntil(m.announcement.apply_end);
    return d !== null && d >= 0 && d <= 3;
  });

  return (
    <Screen>
      <View style={{ paddingTop: 14, gap: 2 }}>
        <T variant="title">관심 공고 {items.length}개</T>
        <Sub>마감 3일 전에 알려드려요</Sub>
      </View>
      {nearest && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12 }}>
          <Icon name="bell" size={16} color={colors.warning} />
          <T variant="small" color={colors.warning} style={{ flex: 1, fontFamily: "GothicA1_700Bold" }}>
            {nearest.announcement.title} 접수가 {longDate(nearest.announcement.apply_end)}에 끝나요
          </T>
        </View>
      )}
      {items.length === 0 ? (
        <Card>
          <T variant="heading">아직 관심 공고가 없어요</T>
          <Sub>공고 상세에서 하트를 누르면 여기에 모이고, 접수 마감 3일 전에 알려드려요.</Sub>
        </Card>
      ) : (
        items.map((m) => <AnnouncementCard key={m.announcement.id} m={m} onPress={() => router.push(`/announcement/${m.announcement.id}`)} />)
      )}
    </Screen>
  );
}
