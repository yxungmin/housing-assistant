import { Tabs } from "expo-router";
import { Icon } from "@/components/icon";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "fade",
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.line, height: 84, paddingTop: 8 },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈", tabBarIcon: ({ color }) => <Icon color={String(color)} name="home" size={26} /> }} />
      <Tabs.Screen name="saved" options={{ title: "관심", tabBarIcon: ({ color }) => <Icon color={String(color)} name="bookmark" size={26} /> }} />
      <Tabs.Screen name="profile" options={{ title: "내 정보", tabBarIcon: ({ color }) => <Icon color={String(color)} name="user" size={26} /> }} />
    </Tabs>
  );
}
