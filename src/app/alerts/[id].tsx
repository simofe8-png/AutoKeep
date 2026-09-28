import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { alertStatusIcon, alertStatusTone, recordServiceHref } from '@/features/alerts/components';
import { useAppData } from '@/features/data/DataContext';
import type { AlertVM } from '@/features/data/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { joinParts } from '@/features/vehicles/format';
import { vehicleDisplayName } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  colors,
  Divider,
  EmptyState,
  Icon,
  radii,
  Screen,
  spacing,
  Stack,
  StatusCard,
  type ButtonProps,
} from '@/ui';

/**
 * Alert detail (T024), reproducing the approved "פרטי התראה" reference (alerts image, middle
 * screen): coloured status card, the alert details table, "why it matters", last completion, and
 * the actions (mark as handled by recording the service · open a new service record · dismiss).
 * The target vehicle is always identified (UX baseline); opening an alert from a notification
 * switches the active context to the alert's own vehicle.
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
      <Screen header={<ScreenHeader title={he.alerts.detailTitle} brand />}>
        <EmptyState icon="bell-off-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }

  const actions = alertActions(alert, router);

  return (
    <Screen
      testID="screen-alert-detail"
      header={<ScreenHeader title={he.alerts.detailTitle} brand />}
    >
      <StatusCard
        testID="alert-status"
        tone={alert.handled ? 'success' : alertStatusTone[alert.kind]}
        icon={alert.handled ? 'check' : alertStatusIcon[alert.kind]}
        title={alert.title}
        subtitle={alert.handled ? he.alerts.handled : he.alerts.kinds[alert.kind]}
      />
      <View
        testID="vehicle-target-banner"
        style={styles.vehicleLine}
        accessible
        accessibilityLabel={`${he.alerts.vehicle}: ${vehicleDisplayName(owner)}, ${owner.registration}`}
      >
        <Icon name="car-outline" size={20} color="textSecondary" />
        <AppText variant="small" color="textSecondary">
          {`${he.alerts.vehicle}: `}
        </AppText>
        <AppText variant="smallStrong" style={styles.flex}>
          {joinParts([vehicleDisplayName(owner), owner.registration])}
        </AppText>
      </View>

      <View style={styles.card} testID="alert-basis">
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
          danger={!alert.handled && alert.kind === 'overdue'}
        />
      </View>

      <View style={[styles.card, styles.why]} testID="alert-why">
        <View style={styles.flex}>
          <AppText variant="heading">{he.alerts.whyItMatters}</AppText>
          <AppText variant="small" color="textSecondary">
            {alert.reason}
          </AppText>
        </View>
        <Icon name="information-outline" size={28} color="primary" />
      </View>

      {alert.lastCompletion ? (
        <View style={styles.card} testID="alert-last-completion">
          <AppText variant="heading" accessibilityRole="header">
            {he.alerts.lastCompletion}
          </AppText>
          <View style={styles.historyRow}>
            <AppText style={styles.flex}>{alert.lastCompletion}</AppText>
            <Icon name="check-circle" size={26} color="success" />
          </View>
        </View>
      ) : null}

      {!alert.handled ? (
        <Stack gap={spacing.sm}>
          {actions.map((a) => (
            <Button key={a.label} {...a} fullWidth />
          ))}
          <Button
            testID="alert-new-service"
            label={he.alerts.openNewService}
            icon="wrench-outline"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/service/new')}
          />
          <Button
            testID="alert-snooze"
            label={he.alerts.dismiss}
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
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="small" color="textSecondary" style={styles.label}>
        {label}
      </AppText>
      <AppText
        variant="smallStrong"
        color={danger ? 'danger' : 'textPrimary'}
        align="end"
        style={styles.flex}
      >
        {value}
      </AppText>
    </View>
  );
}

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
    case 'deferred':
      return [record];
    case 'stale_odometer':
      return [
        {
          testID: 'alert-update-odometer',
          label: he.alerts.updateOdometer,
          icon: 'speedometer',
          onPress: () => router.push('/odometer'),
        },
      ];
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { width: 120 },
  vehicleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  why: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surfaceTint,
    borderColor: colors.primaryBorder,
  },
  detailRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 32 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
