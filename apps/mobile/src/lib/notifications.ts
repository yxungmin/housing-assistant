/**
 * 알림 (M7).
 *  - 관심 공고 마감 3일 전, 신청한 공고의 당첨자 발표 3일 전·1일 전·당일, 첫 결제 3일 전 09:00 기기 예약 알림.
 *    무엇을 언제 걸지는 `reminders.ts`가 정하고(순수 함수·테스트 있음) 여기서는 예약만 한다.
 *  - 관심 공고의 값이 바뀌면 즉시 알림: 조용히 바꾸지 않기 위한 것이다 (changes.ts).
 *  - 신규 공고 푸시: Expo 푸시 토큰을 받아 Supabase push_subscriptions에 지역·유형과 함께 등록한다 (remote.ts).
 * 웹은 알림을 지원하지 않으므로 모두 no-op.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import { plannedReminders, type ReminderItem } from "./reminders";

const native = Platform.OS === "ios" || Platform.OS === "android";
// 웹 번들에서 모듈 경고를 내지 않도록 네이티브에서만 지연 로드한다
const mod = () => import("expo-notifications");

export const notificationsSupported = native;

let handlerSet = false;
/**
 * 알림을 눌렀을 때 어느 공고인지. 켜 둔 동안의 탭과, 알림으로 앱을 연 첫 탭(getLastNotificationResponseAsync) 둘 다 본다.
 * 전에는 data.announcementId를 넣기만 하고 읽는 곳이 없어서 알림을 눌러도 앱이 있던 자리에 열렸다 (2026-09-24 감사).
 * 같은 알림을 두 번 처리하지 않도록 식별자를 기억한다.
 */
export async function subscribeNotificationTaps(onAnnouncement: (id: string) => void): Promise<() => void> {
  if (!native) return () => {};
  const Notifications = await mod();
  let last: string | null = null;
  const handle = (r: { notification: { request: { identifier: string; content: { data?: Record<string, unknown> } } } } | null) => {
    if (!r) return;
    const key = r.notification.request.identifier;
    if (key === last) return;
    last = key;
    const id = r.notification.request.content.data?.announcementId;
    if (typeof id === "string" && id) onAnnouncement(id);
  };
  handle(await Notifications.getLastNotificationResponseAsync());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

export async function setupNotificationHandler(): Promise<void> {
  if (!native || handlerSet) return;
  handlerSet = true;
  const Notifications = await mod();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync("deadline", { name: "접수 마감 알림", importance: Notifications.AndroidImportance.DEFAULT });
    void Notifications.setNotificationChannelAsync("announce", { name: "당첨자 발표 알림", importance: Notifications.AndroidImportance.HIGH });
    void Notifications.setNotificationChannelAsync("new", { name: "새 공고 알림", importance: Notifications.AndroidImportance.DEFAULT });
    void Notifications.setNotificationChannelAsync("change", { name: "관심 공고 변경 알림", importance: Notifications.AndroidImportance.HIGH });
    // 결제 고지는 끄기 어렵게 만들 이유가 없다. 다만 채널이 없으면 안드로이드가 예약을 조용히 버린다
    void Notifications.setNotificationChannelAsync("billing", { name: "결제 예정 알림", importance: Notifications.AndroidImportance.HIGH });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    const Notifications = await mod();
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const res = await Notifications.requestPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

/**
 * 기기 예약 알림을 현재 목록으로 다시 건다 (기존 예약은 모두 지우고).
 *
 * 마감과 발표를 한 번에 거는 이유: 예약을 `cancelAll`로 지우고 다시 걸기 때문에
 * 종류별로 나눠 부르면 나중에 부른 쪽이 앞의 것을 지운다.
 */
export async function syncReminders(
  items: ReminderItem[],
  enabled: boolean,
  /** 첫 결제 고지도 같은 예약에 실어야 한다. 따로 걸면 cancelAll에 지워진다 */
  billing: { chargeAt?: string | null; priceText?: string } = {},
): Promise<number> {
  if (!native) return 0;
  try {
    const Notifications = await mod();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!enabled) return 0;
    const planned = plannedReminders(items, new Date(), billing);
    for (const r of planned) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: r.title,
          body: r.body,
          data: { announcementId: r.announcementId, kind: r.kind },
          ...(Platform.OS === "android" ? { channelId: r.channel } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
      });
    }
    return planned.length;
  } catch {
    return 0;
  }
}

/**
 * 관심 공고의 값이 바뀌었다고 지금 알린다.
 * 예약이 아니라 즉시 표시라 syncReminders의 cancelAll에 지워지지 않는다.
 */
export async function notifyChange(announcementId: string, title: string, body: string): Promise<boolean> {
  if (!native) return false;
  try {
    const Notifications = await mod();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${title} 정보가 바뀌었어요`,
        body,
        data: { announcementId },
        ...(Platform.OS === "android" ? { channelId: "change" } : {}),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Expo 푸시 토큰. Expo Go(Android)나 권한 없음이면 null */
export async function getPushToken(): Promise<string | null> {
  if (!native) return null;
  try {
    const Notifications = await mod();
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}
