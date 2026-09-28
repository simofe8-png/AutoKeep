import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, directionalIcons, radii, spacing } from '../theme';
import { Icon } from './Icon';

export type TimelineStatus = 'done' | 'current' | 'upcoming' | 'pending';

const marker: Record<
  TimelineStatus,
  { bg: string; border: string; icon?: 'check' | 'clock-outline' }
> = {
  done: { bg: colors.successStrong, border: colors.successStrong, icon: 'check' },
  current: { bg: colors.primary, border: colors.primary, icon: 'clock-outline' },
  upcoming: { bg: colors.surface, border: '#AEB7C6' },
  pending: { bg: '#8C97A6', border: '#8C97A6', icon: 'check' },
};

/**
 * One entry of a vertical timeline (reference: maintenance plan and history). The rail with the
 * status marker sits at the reading end; the content card at the start.
 */
export function TimelineItem({
  status,
  first = false,
  last = false,
  highlighted = false,
  onPress,
  children,
  testID,
  accessibilityLabel,
}: {
  status: TimelineStatus;
  first?: boolean;
  last?: boolean;
  highlighted?: boolean;
  onPress?: () => void;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const m = marker[status];
  const card = [
    styles.card,
    highlighted && { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
    status === 'current' && !highlighted && { borderColor: colors.primaryBorder },
  ];
  const content = (
    <>
      <View style={styles.content}>{children}</View>
      {onPress ? <Icon name={directionalIcons.forward} size={22} color="textPrimary" /> : null}
    </>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable
          testID={testID}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          android_ripple={{ color: colors.primarySoft }}
          style={({ pressed }) => [...card, pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View
          testID={testID}
          style={card}
          accessible={accessibilityLabel != null}
          accessibilityLabel={accessibilityLabel}
        >
          {content}
        </View>
      )}
      <View style={styles.rail}>
        <View style={[styles.line, first && styles.hidden]} />
        <View
          style={[
            styles.marker,
            { backgroundColor: m.bg, borderColor: m.border },
            status === 'current' && styles.markerCurrent,
          ]}
        >
          {m.icon ? (
            <Icon name={m.icon} size={status === 'current' ? 22 : 18} color="textOnPrimary" />
          ) : null}
        </View>
        <View style={[styles.line, last && styles.hidden]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  content: { flex: 1, gap: spacing.xxs },
  pressed: { opacity: 0.9 },
  rail: { width: 40, alignItems: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.primaryBorder },
  hidden: { opacity: 0 },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCurrent: { width: 38, height: 38, borderRadius: 19 },
});
