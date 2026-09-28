import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { alertStatusIcon, alertStatusTone, recordServiceHref } from '@/features/alerts/components';
import { useAppData } from '@/features/data/DataContext';
import type { AlertVM } from '@/features/data/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { VehicleContextCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  Screen,
  spacing,
  Stack,
  StatusCard,
  type ButtonProps,
} from '@/ui';

/**
 * Alert detail (T024): why it exists, its data basis, the vehicle, last completion, and the
 * relevant actions. Opening an alert (e.g. from a notification deep link) switches the active
 * context to the alert's own vehicle.
 */
export default function AlertDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle, setAlertHandled, snoozeAlert } = useAppData();
  const { activeVehicleId, setActiveVehicleId } = useActiveVehicle();

  const owner = vehicles.find((v) => getBundle(v.id).alerts.some((a) => a.id === id));
  const alert = owner ? getBundle(owner.id).alerts.find((a) => a.id === id) : undefined;

  useEffect(() => {
    if (owner && owner.id !== activeVehicleId && !owner.archived) setActiveVehicleId(owner.id);
  }, [owner, activeVehicleId, setActiveVehicleId]);

  if (!owner || !alert) {
    return (
      <Screen header={<ScreenHeader title={he.alerts.title} />}>
        <EmptyState icon="bell-off-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }

  const actions = alertActions(alert, router);

  return (
    <Screen testID="screen-alert-detail" header={<ScreenHeader title={he.alerts.detailTitle} />}>
      <VehicleContextCard
        vehicle={owner}
        label={he.alerts.vehicle}
        testID="vehicle-target-banner"
      />
      <StatusCard
        testID="alert-status"
        tone={alert.handled ? 'success' : alertStatusTone[alert.kind]}
        icon={alert.handled ? 'check' : alertStatusIcon[alert.kind]}
        title={alert.title}
        subtitle={alert.handled ? he.alerts.handled : he.alerts.kinds[alert.kind]}
      />
      <Card testID="alert-basis">
        <Stack gap={spacing.sm}>
          <AppText variant="heading" accessibilityRole="header">
            {he.alerts.details}
          </AppText>
          <DetailRow label={he.alerts.kindLabel} value={he.alerts.kinds[alert.kind]} />
          <Divider />
          <DetailRow label={he.alerts.basis} value={alert.basis} />
          <Divider />
          <DetailRow
            label={he.alerts.status}
            value={alert.handled ? he.alerts.handled : he.alerts.active}
            strong
          />
        </Stack>
      </Card>
      <Card tone="tint" testID="alert-why">
        <View style={styles.why}>
          <Icon name="information-outline" size={24} color="primary" />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{he.alerts.why}</AppText>
            <AppText color="textSecondary">{alert.reason}</AppText>
          </View>
        </View>
      </Card>
      {alert.lastCompletion ? (
        <Card testID="alert-last-completion">
          <Stack gap={spacing.xs}>
            <AppText variant="heading" accessibilityRole="header">
              {he.alerts.lastCompletion}
            </AppText>
            <View style={styles.why}>
              <Icon name="check-circle" size={22} color="success" />
              <AppText color="textSecondary" style={styles.flex}>
                {alert.lastCompletion}
              </AppText>
            </View>
          </Stack>
        </Card>
      ) : null}
      {!alert.handled ? (
        <Stack gap={spacing.sm}>
          {actions.map((a) => (
            <Button key={a.label} {...a} fullWidth />
          ))}
          <Button
            testID="alert-snooze"
            label={he.alerts.snooze}
            icon="calendar-clock"
            variant="secondary"
            fullWidth
            onPress={() => {
              snoozeAlert(owner.id, alert.id, 7);
              router.back();
            }}
          />
          <Button
            testID="alert-mark-handled"
            label={he.alerts.markWithoutRecord}
            variant="ghost"
            fullWidth
            onPress={() => {
              setAlertHandled(owner.id, alert.id);
              router.back();
            }}
          />
        </Stack>
      ) : null}
    </Screen>
  );
}

function DetailRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="small" color="textMuted" style={styles.label}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={styles.flex}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { width: 110 },
  detailRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  why: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
});

function alertActions(alert: AlertVM, router: ReturnType<typeof useRouter>): ButtonProps[] {
  // "סמן כטופל" (reference) = record the service with the item preselected.
  const record: ButtonProps = {
    testID: 'alert-record-service',
    label: he.alerts.markDone,
    icon: 'check',
    onPress: () => router.push(recordServiceHref(alert)),
  };
  switch (alert.kind) {
    case 'upcoming':
    case 'overdue':
      return [
        record,
        {
          testID: 'alert-view-service',
          label: he.alerts.viewService,
          icon: 'format-list-checks',
          variant: 'secondary',
          onPress: () => router.push('/next-service'),
        },
      ];
    case 'stale_odometer':
      return [
        {
          testID: 'alert-update-odometer',
          label: he.alerts.updateOdometer,
          icon: 'speedometer',
          onPress: () => router.push('/odometer'),
        },
      ];
    case 'deferred':
      return [record];
  }
}
