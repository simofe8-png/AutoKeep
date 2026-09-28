import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  activeAlerts,
  alertGroup,
  alertPriority,
  alertStatusIcon,
  alertStatusTone,
  recordServiceHref,
  type AlertGroup,
} from '@/features/alerts/components';
import { useAppData, useVehicleData } from '@/features/data/DataContext';
import type { AlertVM } from '@/features/data/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { VehicleContextCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  colors,
  directionalIcons,
  EmptyState,
  FilterChips,
  Icon,
  IconCircle,
  radii,
  Screen,
  spacing,
  Stack,
  type ButtonVariant,
} from '@/ui';

const GROUPS: AlertGroup[] = ['urgent', 'soon', 'info'];

/**
 * Alerts and reminders (T024) after the approved "התראות ותזכורות" reference: the vehicle, filters
 * by urgency, numbered groups and the relevant actions on every alert. Each alert identifies its
 * vehicle and stays explainable in its detail screen.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { alerts } = useVehicleData(activeVehicle?.id ?? null);
  const { snoozeAlert } = useAppData();
  const [filter, setFilter] = useState<'all' | AlertGroup>('all');
  const list = [...activeAlerts(alerts)].sort(
    (a, b) => alertPriority[a.kind] - alertPriority[b.kind],
  );
  const count = (g: AlertGroup) => list.filter((a) => alertGroup[a.kind] === g).length;
  const groups = GROUPS.filter((g) => (filter === 'all' || filter === g) && count(g) > 0);

  return (
    <Screen
      header={<ScreenHeader title={he.alerts.listTitle} subtitle={he.alerts.listSubtitle} brand />}
      testID="screen-alerts"
    >
      {activeVehicle ? (
        <VehicleContextCard
          vehicle={activeVehicle}
          label={he.alerts.vehicle}
          testID="vehicle-target-banner"
          onPress={() => router.push('/vehicles')}
        />
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          icon="bell-check-outline"
          title={he.alerts.empty}
          message={he.alerts.emptyBody}
          testID="alerts-empty"
        />
      ) : (
        <>
          <FilterChips
            tone="dark"
            testID="alerts-filter"
            accessibilityLabel={he.alerts.listTitle}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all' as const, label: he.alerts.filters.all, count: list.length },
              ...GROUPS.map((g) => ({
                value: g,
                label: he.alerts.filters[g],
                count: count(g),
              })),
            ]}
          />
          {groups.map((g) => (
            <Stack key={g} testID={`alerts-group-${g}`} gap={spacing.sm}>
              <View style={styles.groupHead}>
                <View style={[styles.count, { backgroundColor: countColor[g] }]}>
                  <AppText variant="smallStrong" color="textOnPrimary">
                    {String(count(g))}
                  </AppText>
                </View>
                <AppText variant="heading" accessibilityRole="header">
                  {he.alerts.groups[g]}
                </AppText>
              </View>
              {list
                .filter((a) => alertGroup[a.kind] === g)
                .map((a) => (
                  <AlertListCard
                    key={a.id}
                    alert={a}
                    onOpen={() => router.push(`/alerts/${a.id}`)}
                    onRecord={() => router.push(recordServiceHref(a))}
                    onOdometer={() => router.push('/odometer')}
                    onSnooze={() => activeVehicle && snoozeAlert(activeVehicle.id, a.id, 7)}
                  />
                ))}
            </Stack>
          ))}
        </>
      )}
    </Screen>
  );
}

const countColor: Record<AlertGroup, string> = {
  urgent: colors.dangerStrong,
  soon: '#E39A00',
  info: colors.primary,
};

function AlertListCard({
  alert,
  onOpen,
  onRecord,
  onOdometer,
  onSnooze,
}: {
  alert: AlertVM;
  onOpen: () => void;
  onRecord: () => void;
  onOdometer: () => void;
  onSnooze: () => void;
}) {
  const group = alertGroup[alert.kind];
  const actions: { label: string; variant: ButtonVariant; onPress: () => void; testID: string }[] =
    group === 'urgent'
      ? [
          { label: he.alerts.viewDetails, variant: 'danger', onPress: onOpen, testID: 'open' },
          {
            label: he.alerts.markDone,
            variant: 'dangerOutline',
            onPress: onRecord,
            testID: 'record',
          },
        ]
      : alert.kind === 'stale_odometer'
        ? [
            {
              label: he.alerts.updateOdometerShort,
              variant: 'primary',
              onPress: onOdometer,
              testID: 'odometer',
            },
            { label: he.alerts.later, variant: 'secondary', onPress: onSnooze, testID: 'snooze' },
          ]
        : [
            { label: he.alerts.viewDetails, variant: 'attention', onPress: onOpen, testID: 'open' },
            {
              label: he.alerts.dismissForWeek,
              variant: 'secondary',
              onPress: onSnooze,
              testID: 'snooze',
            },
          ];
  return (
    <View
      testID={`alert-card-${alert.id}`}
      style={[styles.card, group === 'urgent' && styles.cardUrgent]}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${he.alerts.kinds[alert.kind]}: ${alert.title}`}
        style={styles.cardHead}
      >
        <IconCircle
          icon={alertStatusIcon[alert.kind]}
          tone={alertStatusTone[alert.kind]}
          size={52}
          solid={false}
        />
        <View style={styles.flex}>
          <AppText variant="heading" color={group === 'urgent' ? 'danger' : 'textPrimary'}>
            {alert.title}
          </AppText>
          <AppText variant="small" color={group === 'soon' ? 'warning' : 'textSecondary'}>
            {he.alerts.kinds[alert.kind]}
          </AppText>
          <AppText variant="small" color="textSecondary" numberOfLines={2}>
            {alert.reason}
          </AppText>
        </View>
        <Icon name={directionalIcons.forward} size={24} color="textPrimary" />
      </Pressable>
      <View style={styles.actions}>
        {actions.map((a) => (
          <Button
            key={a.testID}
            testID={`alert-card-${alert.id}-${a.testID}`}
            label={a.label}
            variant={a.variant}
            size="sm"
            style={styles.flex}
            onPress={a.onPress}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardUrgent: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
