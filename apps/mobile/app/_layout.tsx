import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useAnnouncements } from "@/data/announcements";
import { registerPushSubscription } from "@/data/remote";
import { useAnnouncementSync } from "@/data/sync";
import { changeSummary } from "@/lib/changes";
import { chargeDate } from "@/lib/billing";
import { usePrice } from "@/data/price";
import { notifyChange, setupNotificationHandler, subscribeNotificationTaps, syncReminders } from "@/lib/notifications";
import { AppStateProvider, useAppState, type PinnedSchedule } from "@/store/appState";
import { TermsUpdateSheet } from "@/components/TermsUpdateSheet";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** 알림·딥링크로 상세에 바로 들어와도 스택 아래에 홈을 깐다. 없으면 뒤로가기가 앱을 닫는다 (2026-09-24 감사) */
export const unstable_settings = { initialRouteName: "(tabs)" };
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
  // 알림을 누르면 그 공고로. 목록이 준비된 뒤에 연다 — 그 전에 밀어 넣으면 "공고를 찾을 수 없어요"가 먼저 뜬다
  const router = useRouter();
  useEffect(() => {
    if (!state.loaded) return;
    let off: (() => void) | undefined;
    let gone = false;
    void subscribeNotificationTaps((id) => router.push(`/announcement/${id}`)).then((o) => (gone ? o() : (off = o)));
    return () => {
      gone = true;
      off?.();
    };
  }, [state.loaded, router]);
  // Pretendard 정적 otf (npm pretendard). 키 이름은 src/theme/tokens.ts의 fonts와 같아야 한다.
  const [fontsLoaded, fontError] = useFonts({
    "Pretendard-Regular": require("pretendard/dist/public/static/Pretendard-Regular.otf"),
    "Pretendard-Medium": require("pretendard/dist/public/static/Pretendard-Medium.otf"),
    "Pretendard-SemiBold": require("pretendard/dist/public/static/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("pretendard/dist/public/static/Pretendard-Bold.otf"),
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
      <TermsUpdateSheet />
    </>
  );
}

/**
 * 알림 동기화: 관심 공고·알림 설정·공고 목록이 바뀌면 마감 3일 전 기기 알림을 다시 예약하고,
 * 푸시 토큰이 있으면 내 지역·관심 유형을 서버에 등록한다 (프로필은 보내지 않는다).
 */
function useReminderSync() {
  const { state, rememberSchedules } = useAppState();
  const { list } = useAnnouncements();
  const { saved, applied, notifications, pushToken, loaded, subscription, pinned } = state;
  // 첫 결제 3일 전 고지. 체험 중이고 해지하지 않았을 때만 값이 나온다 (chargeDate)
  const chargeAt = chargeDate(subscription);
  // 고지의 금액도 스토어 가격이 먼저다 — 실제로 긁힐 금액을 알려야 고지다
  const price = usePrice().monthly;
  const region = state.profile?.region_code;
  useEffect(() => {
    if (!loaded) return;
    // 목록에 있는 관심·신청 공고의 일정을 사본에 남긴다. 목록에서 내려간 뒤에도 발표 알림을 걸 수 있게
    const snapshots: Record<string, PinnedSchedule> = {};
    for (const a of list) {
      if (!saved.includes(a.id) && !applied.includes(a.id)) continue;
      snapshots[a.id] = {
        title: a.title,
        apply_end: a.apply_end,
        winner_announce: a.extraction.schedule.winner_announce,
        documents_announce: a.extraction.schedule.documents_announce,
        documents_end: a.extraction.schedule.documents_end,
      };
    }
    if (Object.keys(snapshots).length) rememberSchedules(snapshots);

    // 관심(마감)과 신청함(발표)을 한 번에 넘긴다 — 예약은 지우고 다시 거는 방식이라 나눠 부르면 서로를 지운다.
    // 목록에 없는 공고(마감 뒤 서버가 내렸다)는 사본으로 건다 — 발표는 마감 몇 주 뒤라 그때 목록에는 없다.
    const ids = [...new Set([...saved, ...applied])];
    const items = ids.flatMap((id) => {
      const s = snapshots[id] ?? pinned[id];
      return s ? [{ id, ...s, saved: saved.includes(id), applied: applied.includes(id) }] : [];
    });
    void syncReminders(items, notifications, { chargeAt, priceText: price });
  }, [loaded, list, saved, applied, pinned, notifications, chargeAt, price, rememberSchedules]);
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
