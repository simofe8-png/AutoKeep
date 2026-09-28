import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/DataContext';
import {
  MaintenanceItemList,
  remainingStats,
  ScheduleUnavailable,
  SourceLine,
} from '@/features/maintenance/components';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  colors,
  Divider,
  EmptyState,
  ForecastValue,
  Icon,
  IconCircle,
  ListRow,
  radii,
  Screen,
  spacing,
  Stack,
  UnderlineTabs,
} from '@/ui';

type Tab = 'included' | 'info' | 'history';

/**
 * Next-service detail, reproducing the approved "פרט טיפול" reference (flow image, screen 9):
 * the service card (interval, remaining, labeled forecast), tabs, the list of what the service
 * includes — each manufacturer item expands in place with instruction, action type and exact
 * evidence — then the plan's source. Garage recommendations are kept apart as "not mandatory".
 * No AI recommendations (owner decision 2026-09-28: AI is not an authoritative source).
 */
export default function NextServiceScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { schedule, history, garageRecommendations } = useVehicleData(activeVehicle?.id ?? null);
  const [tab, setTab] = useState<Tab>('included');
  const next = schedule.status === 'verified' ? schedule.next : undefined;
  const openSource = (documentId: string, locator?: string) =>
    router.push(
      `/documents/${documentId}${locator ? `?locator=${encodeURIComponent(locator)}` : ''}`,
    );

  return (
    <Screen
      testID="screen-next-service"
      header={<ScreenHeader title={he.maintenance.detailTitle} />}
    >
      {!next ? (
        schedule.status !== 'verified' ? (
          <ScheduleUnavailable
            schedule={schedule}
            onUploadManual={() => router.push('/documents')}
          />
        ) : (
          <EmptyState
            icon="check-circle-outline"
            title={he.home.noTasks}
            message={he.home.noTasksBody}
          />
        )
      ) : (
        <>
          <View style={styles.summary} testID="next-service-summary">
            <View style={styles.flex}>
              <AppText variant="title" align="center">
                {next.dueAtKm != null ? formatKm(next.dueAtKm) : next.title}
              </AppText>
              <AppText variant="small" color="textSecondary" align="center">
                {next.dueAtKm != null ? next.title : next.intervalLabel}
              </AppText>
              <AppText variant="small" align="center">
                {joinParts([
                  next.dueDate ? formatDate(next.dueDate) : null,
                  ...remainingStats(next).map((s) => `${s.label}: ${s.value}`),
                ])}
              </AppText>
              <View style={styles.center}>
                <Badge
                  label={he.dueStatus[next.status]}
                  tone={
                    next.status === 'overdue'
                      ? 'danger'
                      : next.status === 'upcoming'
                        ? 'warning'
                        : 'success'
                  }
                  testID={`due-${next.status}`}
                />
                {next.forecastDate ? (
                  <ForecastValue
                    value={formatDate(next.forecastDate)}
                    testID="next-service-forecast"
                  />
                ) : null}
              </View>
            </View>
            <Icon name="calendar-month-outline" size={36} color="success" />
          </View>

          <UnderlineTabs
            testID="next-service-tabs"
            accessibilityLabel={he.maintenance.detailTitle}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'included', label: he.maintenance.tabs.included },
              { value: 'info', label: he.maintenance.tabs.info },
              { value: 'history', label: he.maintenance.tabs.history },
            ]}
          />

          {tab === 'included' ? (
            <>
              <View style={styles.card} testID="next-service-manufacturer">
                <View style={styles.groupHead}>
                  <IconCircle icon="factory" tone="info" size={36} />
                  <View style={styles.flex}>
                    <AppText variant="heading" color="primary">
                      {he.maintenance.manufacturerReqs}
                    </AppText>
                    <AppText variant="caption" color="textMuted">
                      {he.maintenance.expandHint}
                    </AppText>
                  </View>
                </View>
                <MaintenanceItemList items={next.items} onOpenSource={openSource} />
              </View>
              {garageRecommendations.length > 0 ? (
                <View style={[styles.card, styles.garage]} testID="next-service-garage">
                  <View style={styles.groupHead}>
                    <IconCircle icon="wrench-outline" tone="warning" size={36} />
                    <AppText variant="heading" color="warning" style={styles.flex}>
                      {`${he.maintenance.garageRecs} (${he.maintenance.notMandatory})`}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="textSecondary">
                    {he.maintenance.garageRecsNote}
                  </AppText>
                  {garageRecommendations.map((r, i) => (
                    <Stack key={r.id} gap={spacing.xxs}>
                      {i > 0 ? <Divider /> : null}
                      <AppText variant="small">{r.text}</AppText>
                      <AppText variant="caption" color="textMuted">
                        {joinParts([r.garage, formatDate(r.date)])}
                      </AppText>
                    </Stack>
                  ))}
                </View>
              ) : null}
            </>
          ) : tab === 'info' ? (
            <View style={styles.card} testID="next-service-info">
              <ListRow
                icon="repeat"
                title={he.maintenance.interval}
                subtitle={next.intervalLabel}
              />
            </View>
          ) : history.length === 0 ? (
            <EmptyState icon="clipboard-text-clock-outline" title={he.maintenance.noHistory} />
          ) : (
            <View style={styles.card} testID="next-service-history">
              {[...history]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      icon="check-circle-outline"
                      title={formatKm(e.odometerKm)}
                      subtitle={formatDate(e.date)}
                      onPress={() => router.push(`/service/${e.id}`)}
                    />
                  </View>
                ))}
            </View>
          )}

          {schedule.source ? (
            <View style={styles.card}>
              <SourceLine
                source={schedule.source}
                onOpen={
                  schedule.source.documentId
                    ? () => openSource(schedule.source!.documentId!)
                    : undefined
                }
              />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  garage: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
