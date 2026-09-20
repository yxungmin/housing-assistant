import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { AppStateProvider, useAppState } from "@/store/appState";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { colors, scheme } = useTheme();
  const { state } = useAppState();
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "slide_from_right" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
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
