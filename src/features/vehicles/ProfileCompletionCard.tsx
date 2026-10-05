import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, Badge, colors, directionalIcons, Icon, IconButton, radii, spacing } from '@/ui';

import { formatDate, formatKm } from './format';
import { ProfileItemSheet } from './ProfileItemSheet';
import type { ProfileCompletion, ProfileItem, ProfileItemKey } from './profileCompletion';
import type { VehicleSummary } from './types';

function itemText(item: ProfileItem, v: VehicleSummary): { title: string; detail: string } {
  const t = he.profile.items;
  switch (item.key) {
    case 'details':
      return {
        title: v.testSource === 'registry' ? t.details.title : t.details.titleNoTest,
        detail: t.details.done,
      };
    case 'test':
      return { title: t.test.title, detail: item.done ? formatDate(v.testUntil!) : t.test.todo };
    case 'odometer':
      return { title: t.odometer.title, detail: formatKm(v.odometerKm) };
    case 'schedule':
      return { title: t.schedule.title, detail: item.done ? t.schedule.done : t.schedule.todo };
    case 'insurance': {
      const until = v.insurance?.compulsoryUntil ?? v.insurance?.otherUntil;
      return { title: t.insurance.title, detail: until ? formatDate(until) : t.insurance.todo };
    }
    case 'pressure': {
      const s = v.spec;
      const values = [s?.tirePressureFront, s?.tirePressureRear].filter(Boolean).join(' / ');
      return { title: t.pressure.title, detail: item.done ? values : t.pressure.todo };
    }
    case 'photo':
      return { title: t.photo.title, detail: item.done ? t.photo.done : t.photo.todo };
  }
}

/**
 * Home card (owner decision 2026-10-05): the vehicle's profile in order of importance, with the
 * percentage of the required items. Each open item opens the screen that completes it; the
 * owner may hide the card.
 */
export function ProfileCompletionCard({
  vehicle,
  completion,
  onHide,
  showTitle = true,
}: {
  vehicle: VehicleSummary;
  completion: ProfileCompletion;
  /** Absent: no "hide" link (the profile screen). */
  onHide?: () => void;
  /** False when the screen's own header already says "השלמת פרופיל הרכב". */
  showTitle?: boolean;
}) {
  const p = he.profile;
  /** The item whose window is open (completed in place, never by leaving the screen). */
  const [open, setOpen] = useState<ProfileItemKey | null>(null);
  let step = 0;
  return (
    <View style={styles.card} testID="profile-card">
      <View style={styles.head}>
        <View style={styles.headRow}>
          {showTitle ? (
            <AppText variant="heading" accessibilityRole="header">
              {p.title}
            </AppText>
          ) : (
            <View />
          )}
          <AppText variant="bodyStrong" color="primary" testID="profile-card-percent">
            {p.percent(completion.percent)}
          </AppText>
        </View>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: completion.percent }}
        >
          <View style={[styles.fill, { width: `${completion.percent}%` }]} />
        </View>
      </View>
      {completion.items.map((item) => {
        const { title, detail } = itemText(item, vehicle);
        const number = item.done ? null : ++step;
        const content = (
          <>
            <View style={[styles.mark, item.done ? styles.markDone : styles.markTodo]}>
              {item.done ? (
                <Icon name="check" size={18} color="success" />
              ) : (
                <AppText variant="smallStrong" color="primary">
                  {String(number)}
                </AppText>
              )}
            </View>
            <View style={styles.text}>
              <View style={styles.titleRow}>
                <AppText
                  variant={item.done ? 'small' : 'bodyStrong'}
                  color={item.done ? 'textMuted' : 'textPrimary'}
                >
                  {title}
                </AppText>
                {!item.done && item.key === 'schedule' ? (
                  <Badge label={p.importantBadge} tone="warning" />
                ) : null}
                {!item.done && !item.required ? (
                  <Badge label={p.optionalBadge} tone="neutral" />
                ) : null}
              </View>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {detail}
              </AppText>
            </View>
          </>
        );
        return item.done ? (
          <View key={item.key} style={styles.row} testID={`profile-item-${item.key}-done`}>
            {content}
          </View>
        ) : (
          <Pressable
            key={item.key}
            testID={`profile-item-${item.key}`}
            onPress={() => setOpen(item.key)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
          >
            {content}
            <Icon name={directionalIcons.forward} size={22} color="primary" />
          </Pressable>
        );
      })}
      <View style={styles.foot}>
        <AppText variant="caption" color="textMuted">
          {p.later}
        </AppText>
        {onHide ? (
          <Pressable
            testID="profile-card-hide"
            onPress={onHide}
            accessibilityRole="button"
            hitSlop={8}
          >
            <AppText variant="caption" color="primary">
              {p.hide}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <ProfileItemSheet item={open} vehicle={vehicle} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Once every required item is done: a short message, shown until closed. */
export function ProfileDoneCard({ onClose }: { onClose: () => void }) {
  return (
    <View style={[styles.card, styles.done]} testID="profile-done">
      <Icon name="check-circle" size={24} color="success" />
      <View style={styles.text}>
        <AppText variant="bodyStrong" color="success">
          {he.profile.doneTitle}
        </AppText>
        <AppText variant="small" color="success">
          {he.profile.doneBody}
        </AppText>
      </View>
      <IconButton
        testID="profile-done-close"
        icon="close"
        color="success"
        accessibilityLabel={he.profile.close}
        onPress={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: { backgroundColor: colors.primarySoft, padding: spacing.md, gap: spacing.sm },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 8, borderRadius: 8, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8, backgroundColor: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 52,
  },
  pressed: { backgroundColor: colors.surfaceTint },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  markTodo: { backgroundColor: colors.primarySoft },
  markDone: { backgroundColor: colors.successSoft },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderColor: colors.successBorder,
    backgroundColor: colors.successSoft,
  },
});
