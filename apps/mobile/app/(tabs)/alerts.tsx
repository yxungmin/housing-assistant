import { useEffect, useMemo } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { animateLayout, Card, EmptyState, IconTile, PageTitle, Screen, Sub, T } from "@/components/ui";
import { useAnnouncements } from "@/data/announcements";
import { RETAIN_DAYS, syncInbox, unreadCount, type AppNotification, type NotificationKind } from "@/lib/inbox";
import { unseenIds } from "@/lib/unseen";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { iconSize, radius, tileSize } from "@/theme/tokens";

const ICON: Record<NotificationKind, "clock" | "alert" | "house"> = { deadline: "clock", change: "alert", new: "house" };
const TONE: Record<NotificationKind, "warn" | "primary" | "gray"> = { deadline: "warn", change: "warn", new: "primary" };

/** "방금 · 3시간 전 · 어제 · 9월 12일". 오래된 것은 날짜로 말한다 */
function when(iso: string, now = new Date()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.floor((now.getTime() - t) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 알림 이력.
 *
 * 푸시는 한 번 뜨고 사라진다. 잠금화면에서 지웠거나 알림을 꺼 둔 사이에 지나간 것은
 * 다시 볼 방법이 없었다 — 접수 마감이나 임대조건 변경처럼 놓치면 손해인 것들이다.
 *
 * 화면을 열 때 지금 목록을 보고 만들 알림을 채운다(`syncInbox`). id가 내용에서 정해지므로
 * 여러 번 열어도 같은 알림이 늘지 않는다.
 */
export default function Alerts() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, addNotifications, readNotification, readAllNotifications, removeNotification } = useAppState();
  const feed = useAnnouncements();

  const fresh = useMemo(
    () => syncInbox(feed.list, state.saved, unseenIds(state.seen, feed.list.map((a) => a.id))),
    [feed.list, state.saved, state.seen],
  );
  useEffect(() => {
    if (state.loaded && fresh.length > 0) addNotifications(fresh);
  }, [state.loaded, fresh]);

  const list = state.inbox;
  const unread = unreadCount(list);

  const open = (n: AppNotification) => {
    readNotification(n.id);
    if (n.announcementId) router.push(`/announcement/${n.announcementId}`);
  };

  return (
    <Screen>
      <PageTitle
        title="알림"
        sub={unread > 0 ? `안 읽은 알림 ${unread}개` : list.length > 0 ? "모두 읽었어요" : undefined}
      />

      {unread > 0 ? (
        <Pressable
          onPress={() => {
            animateLayout();
            readAllNotifications();
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({ alignSelf: "flex-start", paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
        >
          <T variant="small" color={colors.primary}>모두 읽음으로 표시</T>
        </Pressable>
      ) : null}

      {list.length === 0 ? (
        // 알림은 관심 공고에서 나온다. 관심 공고가 없으면 거기부터, 있으면 거기로 보낸다.
        <EmptyState
          icon="bell"
          title="아직 받은 알림이 없어요"
          body="관심 공고의 접수 마감이 다가오거나 임대조건이 바뀌면 여기에 남겨 드릴게요."
          action={
            // 저장 목록에는 지금 목록에서 내려간 공고 id도 남아 있다. 관심 탭이 보여 주는 것과 같게 센다
            feed.list.some((x) => state.saved.includes(x.id))
              ? { label: "관심 공고 보기", onPress: () => router.navigate("/(tabs)/saved") }
              : { label: "공고 둘러보기", onPress: () => router.navigate("/(tabs)") }
          }
        />
      ) : (
        <View style={{ gap: 10 }}>
          {list.map((n) => (
            <Row key={n.id} n={n} onOpen={() => open(n)} onRemove={() => { animateLayout(); removeNotification(n.id); }} />
          ))}
        </View>
      )}

      {list.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
          <Icon name="info" size={iconSize.md} color={colors.text4} />
          <Sub tone="3" variant="caption" style={{ flex: 1 }}>알림은 {RETAIN_DAYS}일 동안 보관하고 그 뒤에는 자동으로 지워져요.</Sub>
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ n, onOpen, onRemove }: { n: AppNotification; onOpen: () => void; onRemove: () => void }) {
  const { colors } = useTheme();
  return (
    // 카드 전체를 누를 수 있게 하면 지우기 버튼이 그 안에 들어가 버튼 속의 버튼이 된다.
    // 웹에서는 경고가 나고, 어느 쪽에서든 지우려다 공고가 열리는 일이 생긴다.
    // 그래서 카드는 그릇으로만 두고 본문과 지우기를 나란히 둔다.
    <Card tone={n.read ? "soft" : "white"} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      {/* 안 읽은 것은 왼쪽 점 하나로 표시한다. 색만 바꾸면 흘긋 봐서는 안 보인다. */}
      <View style={{ width: 8, alignItems: "center", paddingTop: 6 }}>
        {n.read ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
      </View>
      <Pressable
        onPress={n.announcementId ? onOpen : undefined}
        disabled={!n.announcementId}
        accessibilityRole={n.announcementId ? "button" : undefined}
        accessibilityLabel={n.announcementId ? n.title : undefined}
        style={({ pressed }) => ({ flex: 1, flexDirection: "row", gap: 12, alignItems: "flex-start", opacity: pressed ? 0.7 : 1 })}
      >
        <IconTile name={ICON[n.kind]} tone={TONE[n.kind]} size={tileSize.sm} />
        <View style={{ flex: 1, gap: 3 }}>
          <T variant="bodyMedium">{n.title}</T>
          <Sub tone="2" lines={3}>{n.body}</Sub>
          <Sub tone="3" variant="caption">{when(n.at)}{n.announcementId ? " · 눌러서 공고 보기" : ""}</Sub>
        </View>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="이 알림 지우기"
        hitSlop={10}
        style={({ pressed }) => ({ padding: 4, borderRadius: radius.sm, opacity: pressed ? 0.5 : 1 })}
      >
        <Icon name="x" size={iconSize.md} color={colors.text4} />
      </Pressable>
    </Card>
  );
}
