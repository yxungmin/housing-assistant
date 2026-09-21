import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
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
      <Tabs.Screen name="index" options={{ title: "홈", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen name="saved" options={{ title: "관심", tabBarIcon: tabIcon("bookmark") }} />
      <Tabs.Screen name="profile" options={{ title: "내 정보", tabBarIcon: tabIcon("user") }} />
    </Tabs>
  );
}

/**
 * 지금 탭은 채운 아이콘, 나머지는 선 아이콘.
 *
 * 색만으로 구분하면 약하다. 회색과 검정 차이는 흘긋 봐서는 안 보이고,
 * 색을 못 가리는 사람에게는 아예 안 보인다. 채움은 모양 차이라 둘 다에게 보인다.
 * 채움 아이콘은 선 버전과 실루엣이 같아서(`icon/icons.ts`) 탭을 옮겨도 크기가 흔들리지 않는다.
 */
const tabIcon =
  (name: "home" | "bookmark" | "user") =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon name={focused ? `${name}-filled` : name} size={26} color={String(color)} />
  );
