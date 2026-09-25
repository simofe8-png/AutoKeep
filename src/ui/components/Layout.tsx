import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
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
    <SafeAreaView testID={testID} style={styles.safe} edges={edges}>
      {header}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

export function Divider() {
  return <View style={styles.divider} />;
}

export function Stack({
  children,
  gap = spacing.md,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: ViewStyle;
}) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Row({
  children,
  gap = spacing.sm,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: ViewStyle;
}) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
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
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center' },
});
