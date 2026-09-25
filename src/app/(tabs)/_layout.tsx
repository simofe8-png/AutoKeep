import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';

import { he } from '@/i18n/he';
import { colors, fontFamily } from '@/ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function tabIcon(name: IconName, focusedName: IconName) {
  function TabIcon({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    return <MaterialCommunityIcons name={focused ? focusedName : name} color={color} size={size} />;
  }
  return TabIcon;
}

/**
 * Four primary bottom destinations (UX baseline "Primary navigation"). Do not add more:
 * alerts (bell) and settings (profile) are secondary entries in the header.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fontFamily.medium, fontSize: 12 },
        tabBarAllowFontScaling: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: he.tabs.home,
          tabBarAccessibilityLabel: he.tabs.home,
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="maintenance"
        options={{
          title: he.tabs.maintenance,
          tabBarAccessibilityLabel: he.tabs.maintenance,
          tabBarButtonTestID: 'tab-maintenance',
          tabBarIcon: tabIcon('wrench-outline', 'wrench'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: he.tabs.history,
          tabBarAccessibilityLabel: he.tabs.history,
          tabBarButtonTestID: 'tab-history',
          tabBarIcon: tabIcon('clipboard-text-clock-outline', 'clipboard-text-clock'),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: he.tabs.documents,
          tabBarAccessibilityLabel: he.tabs.documents,
          tabBarButtonTestID: 'tab-documents',
          tabBarIcon: tabIcon('file-document-multiple-outline', 'file-document-multiple'),
        }}
      />
    </Tabs>
  );
}
