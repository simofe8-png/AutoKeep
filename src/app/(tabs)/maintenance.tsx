import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/DataContext';
import { ScheduleUnavailable } from '@/features/maintenance/components';
import type { DueStatus } from '@/features/data/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, formatNumber, joinParts } from '@/features/vehicles/format';
import { PlanVehicleCard, RowChevron } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  colors,
  EmptyState,
  Icon,
  radii,
  Screen,
  SegmentFilter,
  spacing,
  StatTile,
  StatusCard,
  TileRow,
  type ColorToken,
  type IconName,
} from '@/ui';

type Filter = 'all' | 'next' | 'done' | 'future';
type Tab = 'plan' | 'manual' | 'documents' | 'history';

interface Entry {
  key: string;
  status: 'done' | 'current' | 'upcoming';
  filter: Exclude<Filter, 'all'>;
  /** Main column (reading start): title line, chip, details. */
  title: string;
  chip?: ReactNode;
  lines: ReactNode[];
  /** Point column (reading end): when the service is due / was done. */
  point: string[];
  onPress?: () => void;
}

/**
 * Maintenance plan (T017), reproducing the approved "תוכנית הטיפולים" reference
 * (docs/design/approved/a_high_resolution_mockup_screenshot_of_a_smartphon.png): vehicle card,
 * section tabs, verified-plan banner, four key figures, and the list of services on a timeline —
 * recorded ones, the next one and the upcoming ones. The next service opens its detail screen,
 * where each manufacturer item expands in place with instruction, action type and evidence (T018).
 */
export default function MaintenanceScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { schedule, history } = useVehicleData(activeVehicle?.id ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const next = schedule.status === 'verified' ? schedule.next : undefined;

  const done: Entry[] = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      key: e.id,
      status: 'done',
      filter: 'done',
      title: formatKm(e.odometerKm),
      chip: <Badge label={he.history.performed} tone="success" />,
      lines: [
        <AppText key="l" variant="caption" color="textSecondary" numberOfLines={2}>
          {e.actions
            .filter((a) => a.performed)
            .map((a) => a.title)
            .join(', ')}
        </AppText>,
      ],
      point: [formatDate(e.date), e.garage ?? he.authority[e.sourceAuthority]],
      onPress: () => router.push(`/service/${e.id}`),
    }));

  const current: Entry[] = next
    ? [
        {
          key: 'next',
          status: 'current',
          filter: 'next',
          title: next.title,
          chip: <Badge label={he.maintenance.nextBadge} tone="info" />,
          lines: [
            <View key="d" testID={`due-${next.status}`}>
              <AppText variant="caption" color={dueColor[next.status]}>
                {he.dueStatus[next.status]}
              </AppText>
            </View>,
            next.forecastDate ? (
              <AppText key="f" variant="caption" color="primary" testID="plan-forecast">
                {`${he.forecast.label}: ${formatDate(next.forecastDate)}`}
              </AppText>
            ) : null,
            <AppText key="i" variant="caption" color="textSecondary" numberOfLines={2}>
              {next.items.map((i) => i.title).join(', ')}
            </AppText>,
          ],
          point: [
            next.dueAtKm != null ? formatKm(next.dueAtKm) : '',
            next.dueDate ? formatDate(next.dueDate) : '',
          ].filter(Boolean),
          onPress: () => router.push('/next-service'),
        },
      ]
    : [];

  const future: Entry[] =
    schedule.status === 'verified'
      ? schedule.upcoming.map((u) => ({
          key: u.id,
          status: 'upcoming',
          filter: 'future',
          title: u.title,
          lines: [],
          point: [
            u.dueAtKm != null ? formatKm(u.dueAtKm) : '',
            u.dueDate ? formatDate(u.dueDate) : '',
          ].filter(Boolean),
        }))
      : [];

  const all = [...done, ...current, ...future];
  const shown = filter === 'all' ? all : all.filter((e) => e.filter === filter);

  const openTab = (tab: Tab) => {
    if (tab === 'manual' || tab === 'documents') router.navigate('/documents');
    if (tab === 'history') router.navigate('/history');
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={he.maintenance.planTitle}
          brand
          backLabel={he.common.back}
          onBack={() => router.navigate('/')}
        />
      }
      edges={['top']}
      testID="screen-maintenance"
      footer={
        next ? (
          <Button
            testID="maintenance-next-details"
            label={he.maintenance.nextDetails}
            icon="chevron-right"
            fullWidth
            onPress={() => router.push('/next-service')}
          />
        ) : undefined
      }
    >
      {activeVehicle ? (
        <PlanVehicleCard vehicle={activeVehicle} onPress={() => router.push('/vehicles')} />
      ) : null}

      <SectionTabs value="plan" onChange={openTab} />

      {schedule.status === 'verified' ? (
        <StatusCard
          testID="plan-source-banner"
          compact
          tone="success"
          icon="check"
          title={he.maintenance.verifiedPlan}
          subtitle={
            schedule.source
              ? `${he.maintenance.basedOn}: ${joinParts([schedule.source.sourceTitle, he.authority[schedule.source.authority]])}`
              : undefined
          }
          onPress={
            schedule.source?.documentId
              ? () => router.push(`/documents/${schedule.source!.documentId!}`)
              : undefined
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
            icon="calendar-month-outline"
            label={he.maintenance.odometerTotal}
            value={formatKm(activeVehicle?.odometerKm ?? 0)}
            style={styles.tile}
          />
          {next.remainingKm != null ? (
            <StatTile
              align="center"
              icon="road-variant"
              iconColor="textPrimary"
              label={next.remainingKm < 0 ? he.home.kmOverdue : he.maintenance.kmToService}
              value={formatKm(Math.abs(next.remainingKm))}
              style={styles.tile}
            />
          ) : null}
          {next.remainingDays != null ? (
            <StatTile
              align="center"
              icon="clock-outline"
              iconColor="warning"
              label={next.remainingDays < 0 ? he.home.daysOverdue : he.maintenance.daysToService}
              value={`${formatNumber(Math.abs(next.remainingDays))} ${he.home.days}`}
              style={styles.tile}
            />
          ) : null}
          <StatTile
            align="center"
            icon="wrench-outline"
            iconColor="success"
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

      <View style={styles.listCard}>
        <View style={styles.listHead}>
          <Icon name="clipboard-list-outline" size={24} color="primary" />
          <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
            {he.maintenance.listTitle}
          </AppText>
        </View>
        <SegmentFilter
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
              <PlanRow key={e.key} entry={e} first={i === 0} last={i === shown.length - 1} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const TABS: { value: Tab; label: string; icon: IconName }[] = [
  { value: 'history', label: he.history.title, icon: 'history' },
  { value: 'documents', label: he.documents.title, icon: 'file-document-outline' },
  { value: 'manual', label: he.maintenance.manualTab, icon: 'book-open-variant' },
  { value: 'plan', label: he.home.plan, icon: 'clipboard-text-outline' },
];

/** Section tabs of the plan reference (history · documents · manual · plan). */
function SectionTabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist" testID="plan-sections">
      {TABS.map((t) => {
        const selected = t.value === value;
        return (
          <Pressable
            key={t.value}
            testID={`plan-section-${t.value}`}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected }}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Icon name={t.icon} size={20} color={selected ? 'primary' : 'textSecondary'} />
            <AppText
              variant="caption"
              color={selected ? 'primary' : 'textSecondary'}
              align="center"
              numberOfLines={2}
              style={selected ? styles.tabLabelSelected : undefined}
            >
              {t.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const dueColor: Record<DueStatus, ColorToken> = {
  ok: 'success',
  upcoming: 'warning',
  overdue: 'danger',
};

const marker = {
  done: { bg: colors.successStrong, border: colors.successStrong, icon: 'check' as IconName },
  current: { bg: colors.primary, border: colors.primary, icon: 'clock-outline' as IconName },
  upcoming: { bg: colors.surface, border: '#AEB7C6', icon: null },
};

/** Timeline row of the plan reference: point column, main column, status marker on the rail. */
function PlanRow({ entry, first, last }: { entry: Entry; first: boolean; last: boolean }) {
  const m = marker[entry.status];
  const body = (
    <>
      {entry.onPress ? <RowChevron /> : <View style={styles.chevronSpace} />}
      <View style={styles.point}>
        {entry.point.map((p, i) => (
          <AppText
            key={p}
            variant={i === 0 ? 'smallStrong' : 'caption'}
            color={i === 0 ? 'textPrimary' : 'textSecondary'}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {p}
          </AppText>
        ))}
      </View>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText variant="smallStrong" style={styles.flexShrink}>
            {entry.title}
          </AppText>
          {entry.chip}
        </View>
        {entry.lines}
      </View>
    </>
  );
  return (
    <View style={styles.planRow} testID={`plan-item-${entry.key}`}>
      {entry.onPress ? (
        <Pressable
          onPress={entry.onPress}
          accessibilityRole="button"
          accessibilityLabel={joinParts([entry.title, ...entry.point])}
          android_ripple={{ color: colors.primarySoft }}
          style={[styles.rowCard, entry.status === 'current' && styles.rowCardCurrent]}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.rowCard}>{body}</View>
      )}
      <View style={styles.rail}>
        <View style={[styles.line, first && styles.hidden]} />
        <View
          style={[
            styles.marker,
            { backgroundColor: m.bg, borderColor: m.border },
            entry.status === 'current' && styles.markerCurrent,
          ]}
        >
          {m.icon ? <Icon name={m.icon} size={18} color="textOnPrimary" /> : null}
        </View>
        <View style={[styles.line, last && styles.hidden]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  tile: { flexBasis: 70, paddingHorizontal: spacing.xs },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxs,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radii.md,
    paddingHorizontal: 2,
  },
  tabSelected: { backgroundColor: colors.primarySoft },
  tabLabelSelected: { fontWeight: '700' },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.xs },
  rowCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.xxs,
  },
  rowCardCurrent: { borderColor: colors.primaryBorder, backgroundColor: colors.surfaceTint },
  chevronSpace: { width: 24 },
  point: { width: 88, gap: 2 },
  main: { flex: 1, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  rail: { width: 34, alignItems: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.primaryBorder },
  hidden: { opacity: 0 },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCurrent: { width: 34, height: 34, borderRadius: 17 },
});
