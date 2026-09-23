import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useAnnouncements } from "@/data/announcements";
import { registerPushSubscription } from "@/data/remote";
import { useAnnouncementSync } from "@/data/sync";
import { changeSummary } from "@/lib/changes";
import { chargeDate } from "@/lib/billing";
import { usePrice } from "@/data/price";
import { notifyChange, setupNotificationHandler, syncReminders } from "@/lib/notifications";
import { AppStateProvider, useAppState } from "@/store/appState";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});
void setupNotificationHandler();

function Root() {
  const { colors, scheme } = useTheme();
  const { state, addChanges } = useAppState();
  // 관심 공고의 값이 바뀌면 기록하고, 알림을 켠 사용자에게는 바로 알린다
  useAnnouncementSync(state.loaded, state.saved, (records) => {
    addChanges(records);
    if (!state.notifications) return;
    for (const r of records) void notifyChange(r.announcementId, r.title, changeSummary(r));
  });
  useReminderSync();
  // Pretendard 정적 otf (npm pretendard). 키 이름은 src/theme/tokens.ts의 fonts와 같아야 한다.
  const [fontsLoaded, fontError] = useFonts({
    "Pretendard-Regular": require("pretendard/dist/public/static/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("pretendard/dist/public/static/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("pretendard/dist/public/static/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("pretendard/dist/public/static/Pretendard-Bold.otf"),
    "Pretendard-ExtraBold": require("pretendard/dist/public/static/Pretendard-ExtraBold.otf"),
  });
  const ready = (fontsLoaded || !!fontError) && state.loaded;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "slide_from_right", animationDuration: 260 }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
}

/**
 * 알림 동기화: 관심 공고·알림 설정·공고 목록이 바뀌면 마감 3일 전 기기 알림을 다시 예약하고,
 * 푸시 토큰이 있으면 내 지역·관심 유형을 서버에 등록한다 (프로필은 보내지 않는다).
 */
function useReminderSync() {
  const { state } = useAppState();
  const { list } = useAnnouncements();
  const { saved, applied, notifications, pushToken, loaded, subscription } = state;
  // 첫 결제 3일 전 고지. 체험 중이고 해지하지 않았을 때만 값이 나온다 (chargeDate)
  const chargeAt = chargeDate(subscription);
  // 고지의 금액도 스토어 가격이 먼저다 — 실제로 긁힐 금액을 알려야 고지다
  const price = usePrice().monthly;
  const region = state.profile?.region_code;
  useEffect(() => {
    if (!loaded) return;
    // 관심(마감)과 신청함(발표)을 한 번에 넘긴다 — 예약은 지우고 다시 거는 방식이라 나눠 부르면 서로를 지운다
    const items = list
      .filter((a) => saved.includes(a.id) || applied.includes(a.id))
      .map((a) => ({
        id: a.id,
        title: a.title,
        apply_end: a.apply_end,
        winner_announce: a.extraction.schedule.winner_announce,
        saved: saved.includes(a.id),
        applied: applied.includes(a.id),
      }));
    void syncReminders(items, notifications, { chargeAt, priceText: price });
  }, [loaded, list, saved, applied, notifications, chargeAt, price]);
  useEffect(() => {
    if (!loaded || !notifications || !pushToken || !region) return;
    void registerPushSubscription(pushToken, [region], ["happy", "national_rental", "purchased_rental", "long_term_rental", "newlywed_hope", "public_sale", "other"]).catch(() => false);
  }, [loaded, notifications, pushToken, region]);
}

export default function RootLayout() {
  return (
    <AppStateProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </AppStateProvider>
  );
}
