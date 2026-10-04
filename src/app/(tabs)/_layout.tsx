import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';

import { barHeight, PRIMARY_TABS, TAB_LABEL_MAX_SCALE } from '@/features/shell/BottomNav';
import { colors, fontFamily } from '@/ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Tab labels scale with the system font but are capped: at the Android maximum (2.0) uncapped
 * labels were clipped/truncated in the fixed-height tab bar (device-verified, M03).
 */
export { TAB_LABEL_MAX_SCALE };

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
          height: barHeight(insets.bottom),
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarLabel: TabLabel,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {PRIMARY_TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarButtonTestID: t.testID,
            tabBarIcon: tabIcon(t.icon, t.focusedIcon),
          }}
        />
      ))}
    </Tabs>
  );
}
