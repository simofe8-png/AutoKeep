import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';

import { he } from '@/i18n/he';
import { colors, fontFamily } from '@/ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Tab labels scale with the system font but are capped: at the Android maximum (2.0) uncapped
 * labels were clipped/truncated in the fixed-height tab bar (device-verified, M03).
 */
export const TAB_LABEL_MAX_SCALE = 1.3;

function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
      style={{ color, fontFamily: fontFamily.medium, fontSize: 12, textAlign: 'center' }}
    >
      {children}
    </Text>
  );
}

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
  // Explicit height: the default 49dp clipped scaled Hebrew labels on small screens (M03).
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        // Reference: the active destination sits on a light-blue rounded background.
        tabBarActiveBackgroundColor: colors.primarySoft,
        tabBarItemStyle: { borderRadius: 16, marginHorizontal: 6, marginVertical: 2 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarLabel: TabLabel,
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
