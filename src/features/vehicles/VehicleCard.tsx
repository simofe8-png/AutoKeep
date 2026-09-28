import { Pressable, StyleSheet, View } from 'react-native';

import type { VehicleDataBundle } from '@/features/data/types';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  colors,
  Icon,
  IconButton,
  PlateBadge,
  radii,
  spacing,
  verificationLabel,
  type ColorToken,
  type IconName,
} from '@/ui';

import { formatDate, formatKm } from './format';
import { vehicleDisplayName, type VehicleSummary } from './types';
import { VehiclePhoto, vehicleSpecLine } from './VehicleVisuals';

/**
 * Grounded maintenance state for the card (never "תקין"): the due status of a verified schedule,
 * otherwise the schedule's verification state.
 */
function vehicleStatus(bundle: VehicleDataBundle): {
  text: string;
  icon: IconName;
  color: ColorToken;
} {
  const next = bundle.schedule.status === 'verified' ? bundle.schedule.next : undefined;
  if (next?.status === 'overdue')
    return { text: he.dueStatus.overdue, icon: 'alert-circle', color: 'danger' };
  if (next?.status === 'upcoming')
    return { text: he.dueStatus.upcoming, icon: 'clock-outline', color: 'warning' };
  if (next) return { text: he.dueStatus.ok, icon: 'calendar-check', color: 'success' };
  if (bundle.schedule.status === 'verified') {
    return { text: he.myVehicles.noTasksShort, icon: 'calendar-check', color: 'success' };
  }
  return {
    text:
      bundle.schedule.status === 'pending'
        ? he.myVehicles.pendingShort
        : verificationLabel(bundle.schedule.status),
    icon: bundle.schedule.status === 'pending' ? 'clock-outline' : 'alert-circle-outline',
    color: 'textSecondary',
  };
}

/**
 * Vehicle card of the approved "הרכבים שלי" reference: image, name, spec line and plate, the
 * active-vehicle ribbon, and status / odometer / next service. Tapping switches the active
 * vehicle (context only); "ניהול ופרטים" opens the vehicle.
 */
export function VehicleCard({
  vehicle,
  bundle,
  active,
  onSelect,
  onManage,
}: {
  vehicle: VehicleSummary;
  bundle: VehicleDataBundle;
  active: boolean;
  onSelect?: () => void;
  onManage: () => void;
}) {
  const next = bundle.schedule.status === 'verified' ? bundle.schedule.next : undefined;
  const status = vehicleStatus(bundle);
  const selectable = onSelect && !active;
  const nextValue = next?.dueDate
    ? formatDate(next.dueDate)
    : next?.dueAtKm != null
      ? formatKm(next.dueAtKm)
      : '—';
  const nextDetail =
    next?.remainingDays != null
      ? next.remainingDays < 0
        ? he.home.daysLate(-next.remainingDays)
        : he.home.inDays(next.remainingDays)
      : undefined;

  const main = (
    <View style={styles.main}>
      <View style={styles.text}>
        <AppText variant="heading">{`${vehicle.manufacturer} ${vehicle.model}`}</AppText>
        <AppText variant="small" color="textSecondary">
          {vehicleSpecLine(vehicle)}
        </AppText>
        <PlateBadge number={vehicle.registration} size="sm" />
      </View>
      <VehiclePhoto vehicle={vehicle} variant="card" />
    </View>
  );

  return (
    <View
      testID={`vehicle-card-${vehicle.id}`}
      style={[styles.card, active && styles.active, vehicle.archived && styles.archived]}
    >
      {active ? (
        <View style={styles.ribbon}>
          <AppText variant="smallStrong" color="textOnPrimary">
            {he.myVehicles.activeRibbon}
          </AppText>
        </View>
      ) : null}
      <View style={styles.manage}>
        <IconButton
          testID={`vehicle-manage-${vehicle.id}`}
          icon="chevron-right"
          accessibilityLabel={`${he.myVehicles.manage}: ${vehicleDisplayName(vehicle)}`}
          onPress={onManage}
        />
      </View>
      {selectable ? (
        <Pressable
          testID={`vehicle-select-${vehicle.id}`}
          onPress={onSelect}
          accessibilityRole="button"
          accessibilityLabel={`${he.activeVehicle.switch}: ${vehicleDisplayName(vehicle)}, ${vehicle.registration}`}
          android_ripple={{ color: colors.primarySoft }}
        >
          {main}
        </Pressable>
      ) : (
        main
      )}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <AppText variant="caption" color="textMuted">
            {he.myVehicles.status}
          </AppText>
          <View style={styles.statusRow}>
            <Icon name={status.icon} size={18} color={status.color} />
            <AppText
              variant="smallStrong"
              color={status.color}
              style={styles.flexShrink}
              numberOfLines={2}
            >
              {status.text}
            </AppText>
          </View>
        </View>
        <View style={[styles.stat, styles.statMiddle]}>
          <AppText variant="caption" color="textMuted">
            {he.home.odometerNow}
          </AppText>
          <AppText variant="smallStrong" numberOfLines={1} adjustsFontSizeToFit>
            {formatKm(vehicle.odometerKm)}
          </AppText>
        </View>
        <View style={styles.stat}>
          <AppText variant="caption" color="textMuted">
            {he.home.nextService}
          </AppText>
          <AppText variant="smallStrong" numberOfLines={1} adjustsFontSizeToFit>
            {nextValue}
          </AppText>
          {nextDetail ? (
            <AppText
              variant="caption"
              color={next && next.status === 'overdue' ? 'danger' : 'textSecondary'}
            >
              {nextDetail}
            </AppText>
          ) : null}
        </View>
      </View>
      {vehicle.archived ? <Badge label={he.lifecycle.archivedBadge} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  active: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surfaceTint },
  archived: { backgroundColor: colors.surfaceMuted },
  ribbon: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingStart: 36 },
  manage: { position: 'absolute', start: 2, top: 44, zIndex: 1 },
  text: { flex: 1, gap: spacing.xs },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  statMiddle: {
    borderStartWidth: StyleSheet.hairlineWidth,
    borderEndWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
