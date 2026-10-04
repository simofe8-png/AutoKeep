import { createContext, useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, gutter, spacing } from '../theme';
import { AppText } from './AppText';

export interface ScreenProps {
  children: ReactNode;
  /** Fixed content above the scroll area (e.g. app header). */
  header?: ReactNode;
  /** Fixed content below the scroll area (e.g. primary action). */
  footer?: ReactNode;
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens omit 'bottom' (tab bar handles it). */
  edges?: Edge[];
  contentStyle?: ViewStyle;
  testID?: string;
}

/**
 * True under a bottom navigation bar drawn outside the screen (secondary screens): that bar pads
 * the bottom safe area, so the screen does not.
 */
export const BottomBarBelow = createContext(false);

/** Standard screen: safe area, keyboard avoidance, scrolling and page gutter. */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  edges = ['top', 'bottom'],
  contentStyle,
  testID,
}: ScreenProps) {
  const barBelow = useContext(BottomBarBelow);
  const padded = barBelow ? edges.filter((e) => e !== 'bottom') : edges;
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView testID={testID} style={styles.safe} edges={padded}>
      {header}
      <KeyboardAvoidingView
        style={styles.fill}
        // Android (SDK 57 edge-to-edge) no longer resizes the window for the keyboard, so padding
        // is required on both platforms (device-verified, M03).
        behavior="padding"
      >
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading" accessibilityRole="header" style={styles.fill}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

/**
 * Page title with an optional action placed underneath (not beside), so long Hebrew titles never
 * break mid-word at large font scales (device-verified, M03).
 */
export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.pageTitle}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {action ? <View style={styles.pageAction}>{action}</View> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Stack({
  children,
  gap = spacing.md,
  style,
  testID,
}: {
  children: ReactNode;
  gap?: number;
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[{ gap }, style]}>
      {children}
    </View>
  );
}

export function Row({
  children,
  gap = spacing.sm,
  style,
  testID,
}: {
  children: ReactNode;
  gap?: number;
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.row, { gap }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: {
    paddingHorizontal: gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  footer: {
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pageTitle: { gap: spacing.sm },
  pageAction: { alignSelf: 'flex-start' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center' },
});
