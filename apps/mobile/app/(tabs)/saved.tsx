import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { EmptyState, Notice, PageTitle, Screen } from "@/components/ui";
import { matchAll, useAnnouncements } from "@/data/announcements";
import { daysUntil, longDate } from "@/lib/format";
import { applyPhase, closesWithin, phaseRank } from "@/lib/phase";
import { unseenChange } from "@/lib/changes";
import { useAppState } from "@/store/appState";
import { syncAnnouncementsOnce } from "@/data/sync";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { isUnseen } from "@/lib/unseen";

/** 관심 공고: D-day 순. 마감 D-3 알림은 기기 예약 알림(M7)으로 붙는다. */
export default function Saved() {
  const { state, addChanges } = useAppState();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void syncAnnouncementsOnce(state.saved, addChanges).finally(() => setRefreshing(false));
  };
  const router = useRouter();
  const { list } = useAnnouncements();
  const items = useMemo(
    () =>
      // 관심 공고만 매칭한다 — 전체를 매칭한 뒤 거르면 관심 세 개를 보려고 오십 개를 계산한다
      matchAll(state.profile, list.filter((a) => state.saved.includes(a.id)))
        // 접수 중 → 접수 전 → 마감, 같은 단계 안에서는 마감이 가까운 순
        .sort(
          (a, b) =>
            phaseRank(applyPhase(a.announcement)) - phaseRank(applyPhase(b.announcement)) ||
            (daysUntil(a.announcement.apply_end) ?? 999) - (daysUntil(b.announcement.apply_end) ?? 999),
        ),
    [state.profile, state.saved, list],
  );
  const changed = items.filter((m) => unseenChange(state.changes, m.announcement.id));
  // 마감 7일 뒤 서버가 목록에서 내린 관심 공고. 조용히 사라지면 "관심에 넣었는데 없어졌다"가 된다 — 어디 갔는지 말한다
  const gone = state.saved.filter((id) => !list.some((a) => a.id === id)).map((id) => state.pinned[id]?.title).filter((t): t is string => !!t);
  // 아직 시작 안 한 공고에 "곧 끝나요"를 띄우지 않는다
  const nearest = items.find((m) => closesWithin(applyPhase(m.announcement), 3));

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title={items.length > 0 ? `관심 공고 ${items.length}개` : "관심 공고"} sub={items.length > 0 ? "알림을 켜면 접수 마감 3일 전에 알려드려요" : undefined} />
      {gone.length > 0 ? (
        <Notice tone="info" icon="info">
          {gone.length === 1 ? `${gone[0]}은(는) 접수가 끝나 목록에서 내려갔어요.` : `관심 공고 ${gone.length}개는 접수가 끝나 목록에서 내려갔어요.`}
          {state.applied.some((id) => !list.some((a) => a.id === id)) ? " 신청했다고 표시한 공고는 발표일에 알려드려요." : ""}
        </Notice>
      ) : null}
      {changed.length > 0 ? (
        <Notice tone="info" icon="bell">
          {changed.length === 1 ? `${changed[0]!.announcement.title} 정보가 바뀌었어요` : `관심 공고 ${changed.length}개의 정보가 바뀌었어요`}
        </Notice>
      ) : null}
      {nearest ? <Notice tone="warn" icon="bell">{nearest.announcement.title} 접수가 {longDate(nearest.announcement.apply_end)}에 끝나요</Notice> : null}
      {items.length === 0 ? (
        <EmptyState
          icon="bookmark"
          illustration="saved"
          title="아직 관심 공고가 없어요"
          body="공고 오른쪽 위의 관심 버튼을 누르면 여기에 모여요. 접수 마감 3일 전에 알려 드릴게요."
          action={{ label: "공고 둘러보기", onPress: () => router.navigate("/(tabs)") }}
        />
      ) : (
        items.map((m) => <AnnouncementCard key={m.announcement.id} m={m} fresh={isUnseen(state.seen, m.announcement.id)} profile={state.profile} onOpen={(id) => router.push(`/announcement/${id}`)} />)
      )}
    </Screen>
  );
}
