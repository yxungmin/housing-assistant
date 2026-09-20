import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GothicA1_400Regular, GothicA1_500Medium, GothicA1_700Bold, GothicA1_800ExtraBold } from "@expo-google-fonts/gothic-a1";
import { Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { AppStateProvider, useAppState } from "@/store/appState";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { colors, scheme } = useTheme();
  const { state } = useAppState();
  const [fontsLoaded, fontError] = useFonts({
    GothicA1_400Regular,
    GothicA1_500Medium,
    GothicA1_700Bold,
    GothicA1_800ExtraBold,
    Manrope_600SemiBold,
    Manrope_700Bold,
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
