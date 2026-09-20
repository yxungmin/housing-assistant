import { useMemo } from "react";
import { useRouter } from "expo-router";
import { Card, IconTile, Notice, PageTitle, Screen, Sub, T } from "@/components/ui";
import { matchAll, useAnnouncements } from "@/data/announcements";
import { daysUntil, longDate } from "@/lib/format";
import { useAppState } from "@/store/appState";
import { AnnouncementCard } from "./index";

/** 관심 공고: D-day 순. 마감 D-3 알림은 기기 예약 알림(M7)으로 붙는다. */
export default function Saved() {
  const { state } = useAppState();
  const router = useRouter();
  const { list } = useAnnouncements();
  const items = useMemo(
    () =>
      matchAll(state.profile, list)
        .filter((m) => state.saved.includes(m.announcement.id))
        .sort((a, b) => (daysUntil(a.announcement.apply_end) ?? 999) - (daysUntil(b.announcement.apply_end) ?? 999)),
    [state.profile, state.saved, list],
  );
  const nearest = items.find((m) => {
    const d = daysUntil(m.announcement.apply_end);
    return d !== null && d >= 0 && d <= 3;
  });

  return (
    <Screen>
      <PageTitle title={`관심 공고 ${items.length}개`} sub="접수 마감 3일 전에 알려드려요" />
      {nearest ? <Notice tone="warn" icon="bell">{nearest.announcement.title} 접수가 {longDate(nearest.announcement.apply_end)}에 끝나요</Notice> : null}
      {items.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}>
          <IconTile name="heart" size={48} tone="danger" />
          <T variant="heading" style={{ fontSize: 18, textAlign: "center" }}>아직 관심 공고가 없어요</T>
          <Sub style={{ textAlign: "center" }}>공고 상세에서 하트를 누르면 여기에 모이고,{"\n"}접수 마감 3일 전에 알려드려요.</Sub>
        </Card>
      ) : (
        items.map((m) => <AnnouncementCard key={m.announcement.id} m={m} onPress={() => router.push(`/announcement/${m.announcement.id}`)} />)
      )}
    </Screen>
  );
}
