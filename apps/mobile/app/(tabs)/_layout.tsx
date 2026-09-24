import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Icon } from "@/components/icon";
import { unreadCount } from "@/lib/inbox";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, iconSize, type } from "@/theme/tokens";

export default function TabLayout() {
  const { colors } = useTheme();
  const { state } = useAppState();
  const unread = unreadCount(state.inbox);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "fade",
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.line, height: 84, paddingTop: 8 },
        tabBarLabelStyle: type.micro,
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen name="saved" options={{ title: "관심", tabBarIcon: tabIcon("bookmark") }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "알림",
          tabBarIcon: tabIcon("bell"),
          // 안 읽은 것이 있다는 사실만 점으로 알린다.
          // 숫자는 세라는 뜻이 되고, 세다 보면 0으로 만드는 게 목적이 된다 — 알림을 그렇게 쓰게 하고 싶지 않다.
          tabBarBadge: unread > 0 ? "" : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, minWidth: 8, maxWidth: 8, height: 8, borderRadius: 4, lineHeight: 8, marginTop: 4 },
        }}
      />
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
const FILLED = { home: "home-filled", bookmark: "bookmark-filled", user: "user-filled", bell: "bell" } as const;

const tabIcon =
  (name: keyof typeof FILLED) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon name={focused ? FILLED[name] : name} size={iconSize.tab} color={String(color)} />
  );
