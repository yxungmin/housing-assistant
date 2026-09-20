import { Tabs } from "expo-router";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text2,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈", tabBarIcon: ({ color }) => <Icon color={String(color)} name="home" size={22} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="saved" options={{ title: "관심", tabBarIcon: ({ color }) => <Icon color={String(color)} name="bookmark" size={22} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="profile" options={{ title: "내 정보", tabBarIcon: ({ color }) => <Icon color={String(color)} name="user" size={22} strokeWidth={1.8} /> }} />
    </Tabs>
  );
}
