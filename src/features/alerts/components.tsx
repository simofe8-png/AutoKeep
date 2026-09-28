import { StyleSheet, View } from 'react-native';

import type { AlertKind, AlertVM } from '@/features/data/types';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Card,
  Icon,
  spacing,
  StatusCard,
  type BadgeTone,
  type IconName,
  type StatusTone,
} from '@/ui';

export const alertTone: Record<AlertKind, BadgeTone> = {
  upcoming: 'warning',
  overdue: 'danger',
  deferred: 'info',
  stale_odometer: 'neutral',
};

export const alertIcon: Record<AlertKind, IconName> = {
  upcoming: 'calendar-clock',
  overdue: 'calendar-alert',
  deferred: 'timer-sand',
  stale_odometer: 'speedometer',
};

const cardTone = {
  upcoming: 'warning',
  overdue: 'danger',
  deferred: 'default',
  stale_odometer: 'muted',
} as const;

export function activeAlerts(alerts: AlertVM[]): AlertVM[] {
  return alerts.filter((a) => !a.handled);
}

/** Urgency order of the alerts reference: overdue, then upcoming, deferred, stale odometer. */
export const alertPriority: Record<AlertKind, number> = {
  overdue: 0,
  upcoming: 1,
  deferred: 2,
  stale_odometer: 3,
};

export function mostUrgentAlert(alerts: AlertVM[]): AlertVM | null {
  return [...alerts].sort((a, b) => alertPriority[a.kind] - alertPriority[b.kind])[0] ?? null;
}

export const alertStatusTone: Record<AlertKind, StatusTone> = {
  overdue: 'danger',
  upcoming: 'warning',
  deferred: 'info',
  stale_odometer: 'neutral',
};

export const alertStatusIcon: Record<AlertKind, IconName> = {
  overdue: 'exclamation-thick',
  upcoming: 'calendar-clock',
  deferred: 'timer-sand',
  stale_odometer: 'speedometer',
};

/** Coloured alert card of the Home reference ("טיפול עבר את המועד"). */
export function AlertStatusCard({
  alert,
  onPress,
  testID,
}: {
  alert: AlertVM;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <StatusCard
      testID={testID}
      tone={alertStatusTone[alert.kind]}
      icon={alertStatusIcon[alert.kind]}
      title={he.alerts.kinds[alert.kind]}
      subtitle={alert.title}
      onPress={onPress}
    />
  );
}

export function AlertCard({ alert, onPress }: { alert: AlertVM; onPress: () => void }) {
  return (
    <Card
      tone={cardTone[alert.kind]}
      onPress={onPress}
      accessibilityLabel={`${he.alerts.kinds[alert.kind]}: ${alert.title}`}
      testID={`alert-card-${alert.id}`}
    >
      <View style={styles.row}>
        <Icon
          name={alertIcon[alert.kind]}
          size={24}
          color={alertTone[alert.kind] === 'danger' ? 'danger' : 'textSecondary'}
        />
        <View style={styles.text}>
          <Badge label={he.alerts.kinds[alert.kind]} tone={alertTone[alert.kind]} />
          <AppText variant="bodyStrong">{alert.title}</AppText>
          <AppText variant="small" color="textSecondary" numberOfLines={2}>
            {alert.reason}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  text: { flex: 1, gap: spacing.xs },
});

/** Urgency groups of the alerts reference. */
export type AlertGroup = 'urgent' | 'soon' | 'info';

export const alertGroup: Record<AlertKind, AlertGroup> = {
  overdue: 'urgent',
  upcoming: 'soon',
  deferred: 'soon',
  stale_odometer: 'info',
};

/**
 * Where "סמן כטופל" leads: recording the service with the alert's item preselected (UX baseline
 * "handled → service recording"), so a handled alert rests on a record, not on a tap.
 */
export function recordServiceHref(alert: AlertVM): string {
  return alert.maintenanceItemId
    ? `/service/new?from=alert&item=${alert.maintenanceItemId}`
    : '/service/new?from=alert';
}
