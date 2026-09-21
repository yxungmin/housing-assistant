/**
 * 알림 (M7).
 *  - 관심 공고 마감 3일 전 09:00 기기 예약 알림: 서버 없이 기기에서만 예약한다.
 *  - 관심 공고의 값이 바뀌면 즉시 알림: 조용히 바꾸지 않기 위한 것이다 (changes.ts).
 *  - 신규 공고 푸시: Expo 푸시 토큰을 받아 Supabase push_subscriptions에 지역·유형과 함께 등록한다 (remote.ts).
 * 웹은 알림을 지원하지 않으므로 모두 no-op.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";

const native = Platform.OS === "ios" || Platform.OS === "android";
// 웹 번들에서 모듈 경고를 내지 않도록 네이티브에서만 지연 로드한다
const mod = () => import("expo-notifications");
const REMIND_DAYS_BEFORE = 3;
const REMIND_HOUR = 9;

export const notificationsSupported = native;

let handlerSet = false;
export async function setupNotificationHandler(): Promise<void> {
  if (!native || handlerSet) return;
  handlerSet = true;
  const Notifications = await mod();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync("deadline", { name: "접수 마감 알림", importance: Notifications.AndroidImportance.DEFAULT });
    void Notifications.setNotificationChannelAsync("new", { name: "새 공고 알림", importance: Notifications.AndroidImportance.DEFAULT });
    void Notifications.setNotificationChannelAsync("change", { name: "관심 공고 변경 알림", importance: Notifications.AndroidImportance.HIGH });
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

export interface DeadlineItem {
  id: string;
  title: string;
  apply_end?: string; // YYYY-MM-DD
}

/** 관심 공고의 마감 3일 전 알림을 다시 예약한다 (기존 예약은 모두 지우고 현재 목록으로). */
export async function syncDeadlineReminders(items: DeadlineItem[], enabled: boolean): Promise<number> {
  if (!native) return 0;
  try {
    const Notifications = await mod();
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!enabled) return 0;
    let scheduled = 0;
    for (const it of items) {
      if (!it.apply_end) continue;
      const [y, m, d] = it.apply_end.split("-").map(Number);
      const at = new Date(y!, m! - 1, d! - REMIND_DAYS_BEFORE, REMIND_HOUR, 0, 0);
      if (at.getTime() <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: "접수 마감 3일 전", body: `${it.title} 접수가 ${m}월 ${d}일에 끝나요.`, data: { announcementId: it.id }, ...(Platform.OS === "android" ? { channelId: "deadline" } : {}) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
      scheduled++;
    }
    return scheduled;
  } catch {
    return 0;
  }
}

/**
 * 관심 공고의 값이 바뀌었다고 지금 알린다.
 * 예약이 아니라 즉시 표시라 syncDeadlineReminders의 cancelAll에 지워지지 않는다.
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
