import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useSegments } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { he } from '@/i18n/he';
import { BottomBarBelow, colors, fontFamily } from '@/ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Labels scale with the system font up to this cap (device-verified clipping beyond it, M03). */
export const TAB_LABEL_MAX_SCALE = 1.3;

/** The four primary destinations (UX baseline "Primary navigation"), shared by both bars. */
export const PRIMARY_TABS: readonly {
  name: 'index' | 'maintenance' | 'history' | 'documents';
  href: '/' | '/maintenance' | '/history' | '/documents';
  title: string;
  icon: IconName;
  focusedIcon: IconName;
  testID: string;
}[] = [
  {
    name: 'index',
    href: '/',
    title: he.tabs.home,
    icon: 'home-outline',
    focusedIcon: 'home',
    testID: 'tab-home',
  },
  {
    name: 'maintenance',
    href: '/maintenance',
    title: he.tabs.maintenance,
    icon: 'wrench-outline',
    focusedIcon: 'wrench',
    testID: 'tab-maintenance',
  },
  {
    name: 'history',
    href: '/history',
    title: he.tabs.history,
    icon: 'clipboard-text-clock-outline',
    focusedIcon: 'clipboard-text-clock',
    testID: 'tab-history',
  },
  {
    name: 'documents',
    href: '/documents',
    title: he.tabs.documents,
    icon: 'file-document-multiple-outline',
    focusedIcon: 'file-document-multiple',
    testID: 'tab-documents',
  },
];

/** Same metrics as the tab bar (explicit height: the default clipped scaled Hebrew labels, M03). */
export const barHeight = (bottomInset: number) => 62 + bottomInset;

/**
 * Screens shown without the bar: the tabs (their own bar), the first-run flow, the full-screen
 * Garage Mode and the document viewer.
 */
function barHidden(segments: readonly string[]) {
  const [first, second] = segments;
  return (
    !first ||
    first === '(tabs)' ||
    first === 'onboarding' ||
    first === 'garage' ||
    (first === 'documents' && second === 'view')
  );
}

/**
 * The bottom menu on secondary screens (owner decision 2026-10-05): the same four destinations
 * as the tab bar; a tap returns to the tabs and opens that one. Hidden while the keyboard is up.
 */
function SecondaryBottomNav() {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="secondary-bottom-nav"
      accessibilityRole="tablist"
      style={[styles.bar, { height: barHeight(insets.bottom), paddingBottom: insets.bottom + 6 }]}
    >
      {PRIMARY_TABS.map((t) => (
        <Pressable
          key={t.name}
          testID={`nav-${t.testID}`}
          accessibilityRole="tab"
          accessibilityLabel={t.title}
          onPress={() => {
            router.dismissAll();
            router.navigate(t.href);
          }}
          style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
        >
          <MaterialCommunityIcons name={t.icon} size={24} color={colors.textSecondary} />
          <Text numberOfLines={1} maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE} style={styles.label}>
            {t.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Wraps the root stack: secondary screens get the bottom menu under them. */
export function WithSecondaryBottomNav({ children }: { children: ReactNode }) {
  const segments = useSegments();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const shown = !barHidden(segments);
  return (
    <View style={styles.fill}>
      <BottomBarBelow.Provider value={shown && !keyboard}>
        <View style={styles.fill}>{children}</View>
      </BottomBarBelow.Provider>
      {shown && !keyboard ? <SecondaryBottomNav /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
    marginHorizontal: 6,
    marginVertical: 2,
  },
  itemPressed: { backgroundColor: colors.primarySoft },
  label: {
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    textAlign: 'center',
  },
});
