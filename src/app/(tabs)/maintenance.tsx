import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/DataContext';
import { DueStatusBadge, dueAtText, ScheduleUnavailable } from '@/features/maintenance/components';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, joinParts } from '@/features/vehicles/format';
import { VehicleContextCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  ForecastValue,
  Screen,
  SectionHeader,
  spacing,
  StatTile,
  StatusCard,
  TileRow,
  TimelineItem,
  type TimelineStatus,
} from '@/ui';

type Filter = 'all' | 'next' | 'done' | 'future';

interface Entry {
  key: string;
  status: TimelineStatus;
  filter: Exclude<Filter, 'all'>;
  render: () => ReactNode;
  onPress?: () => void;
  a11y: string;
}

/**
 * Maintenance plan (T017), laid out after the approved "תוכנית הטיפולים" reference: vehicle,
 * verified-source banner, key figures, and a timeline of the services — recorded ones, the next
 * one and the upcoming ones. The next service opens its detail screen, where each manufacturer
 * item expands in place with its instruction, action type and exact evidence (T018).
 */
export default function MaintenanceScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { schedule, alerts, history } = useVehicleData(activeVehicle?.id ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const alertCount = alerts.filter((a) => !a.handled).length;
  const openSource = (documentId: string) => router.push(`/documents/${documentId}`);
  const next = schedule.status === 'verified' ? schedule.next : undefined;

  const done: Entry[] = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      key: e.id,
      status: 'done',
      filter: 'done',
      onPress: () => router.push(`/service/${e.id}`),
      a11y: `${formatDate(e.date)}, ${formatKm(e.odometerKm)}`,
      render: () => (
        <>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {formatDate(e.date)}
            </AppText>
            <Badge label={he.history.performed} tone="success" />
          </View>
          <AppText variant="small" color="textSecondary">
            {joinParts([formatKm(e.odometerKm), e.garage])}
          </AppText>
          <AppText variant="small" color="textMuted" numberOfLines={2}>
            {e.actions
              .filter((a) => a.performed)
              .map((a) => a.title)
              .join(', ')}
          </AppText>
        </>
      ),
    }));

  const current: Entry[] = next
    ? [
        {
          key: 'next',
          status: 'current',
          filter: 'next',
          onPress: () => router.push('/next-service'),
          a11y: `${he.maintenance.nextBadge}: ${next.title}`,
          render: () => (
            <>
              <View style={styles.titleRow}>
                <AppText variant="bodyStrong" style={styles.flex}>
                  {next.title}
                </AppText>
                <Badge label={he.maintenance.nextBadge} tone="info" />
              </View>
              <AppText variant="small" color="textSecondary">
                {dueAtText(next)}
              </AppText>
              <DueStatusBadge status={next.status} />
              {next.forecastDate ? (
                <ForecastValue value={formatDate(next.forecastDate)} testID="plan-forecast" />
              ) : null}
              <AppText variant="small" color="textMuted" numberOfLines={2}>
                {next.items.map((i) => i.title).join(', ')}
              </AppText>
            </>
          ),
        },
      ]
    : [];

  const future: Entry[] =
    schedule.status === 'verified'
      ? schedule.upcoming.map((u) => ({
          key: u.id,
          status: 'upcoming',
          filter: 'future',
          a11y: u.title,
          render: () => (
            <>
              <AppText variant="bodyStrong">{u.title}</AppText>
              <AppText variant="small" color="textSecondary">
                {joinParts([
                  u.dueAtKm != null ? formatKm(u.dueAtKm) : null,
                  u.dueDate ? formatDate(u.dueDate) : null,
                ])}
              </AppText>
            </>
          ),
        }))
      : [];

  const all = [...done, ...current, ...future];
  const shown = filter === 'all' ? all : all.filter((e) => e.filter === filter);

  return (
    <Screen
      header={<AppHeader alertCount={alertCount} />}
      edges={['top']}
      testID="screen-maintenance"
      footer={
        next ? (
          <Button
            testID="maintenance-next-details"
            label={he.maintenance.nextDetails}
            icon="format-list-checks"
            fullWidth
            onPress={() => router.push('/next-service')}
          />
        ) : undefined
      }
    >
      <AppText variant="title" accessibilityRole="header">
        {he.maintenance.planTitle}
      </AppText>
      {activeVehicle ? (
        <VehicleContextCard
          vehicle={activeVehicle}
          testID="active-vehicle-chip"
          onPress={() => router.push('/vehicles')}
        />
      ) : null}

      {schedule.status === 'verified' ? (
        <StatusCard
          testID="plan-source-banner"
          tone="success"
          icon="check"
          title={he.maintenance.verifiedPlan}
          subtitle={
            schedule.source
              ? `${he.maintenance.basedOn}: ${joinParts([schedule.source.sourceTitle, he.authority[schedule.source.authority]])}`
              : undefined
          }
          onPress={
            schedule.source?.documentId ? () => openSource(schedule.source!.documentId!) : undefined
          }
          accessibilityHint={he.maintenance.openSource}
        />
      ) : (
        <Card tone={schedule.status === 'pending' ? 'warning' : 'muted'}>
          <ScheduleUnavailable
            schedule={schedule}
            onUploadManual={() => router.push('/documents')}
          />
        </Card>
      )}

      {next ? (
        <TileRow testID="plan-figures">
          <StatTile
            align="center"
            icon="road-variant"
            label={he.maintenance.odometerNow}
            value={formatKm(activeVehicle?.odometerKm ?? 0)}
            style={styles.tile}
          />
          {next.remainingKm != null ? (
            <StatTile
              align="center"
              icon="map-marker-distance"
              label={next.remainingKm < 0 ? he.home.kmOverdue : he.maintenance.kmToService}
              value={formatKm(Math.abs(next.remainingKm))}
              style={styles.tile}
            />
          ) : null}
          {next.remainingDays != null ? (
            <StatTile
              align="center"
              icon="clock-outline"
              label={next.remainingDays < 0 ? he.home.daysOverdue : he.maintenance.daysToService}
              value={`${Math.abs(next.remainingDays)} ${he.home.days}`}
              style={styles.tile}
            />
          ) : null}
          <StatTile
            align="center"
            icon="wrench-outline"
            label={he.home.nextService}
            value={
              next.dueAtKm != null
                ? formatKm(next.dueAtKm)
                : next.dueDate
                  ? formatDate(next.dueDate)
                  : next.title
            }
            detail={next.dueAtKm != null && next.dueDate ? formatDate(next.dueDate) : undefined}
            style={styles.tile}
          />
        </TileRow>
      ) : schedule.status === 'verified' ? (
        <StatusCard
          testID="plan-no-tasks"
          tone="success"
          icon="check"
          title={he.home.noTasks}
          subtitle={he.home.noTasksBody}
        />
      ) : null}

      <SectionHeader title={he.maintenance.listTitle} />
      <FilterChips
        testID="plan-filter"
        accessibilityLabel={he.maintenance.listTitle}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: he.maintenance.filters.all },
          { value: 'next', label: he.maintenance.filters.next },
          { value: 'done', label: he.maintenance.filters.done },
          { value: 'future', label: he.maintenance.filters.future },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title={he.maintenance.emptyFilter} />
      ) : (
        <View testID="plan-timeline">
          {shown.map((e, i) => (
            <TimelineItem
              key={e.key}
              testID={`plan-item-${e.key}`}
              status={e.status}
              first={i === 0}
              last={i === shown.length - 1}
              onPress={e.onPress}
              accessibilityLabel={e.a11y}
            >
              {e.render()}
            </TimelineItem>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tile: { flexBasis: 150 },
});
