import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type {
  DueStatus,
  MaintenanceItemVM,
  NextServiceVM,
  ScheduleVM,
  SourceRefVM,
} from '@/features/data/types';
import { formatDate, formatKm, joinParts, NBSP } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  colors,
  Divider,
  ForecastValue,
  Icon,
  InlineNotice,
  radii,
  Row,
  spacing,
  Stack,
  touchTarget,
  VerificationBadge,
  type BadgeTone,
  type IconName,
} from '@/ui';

const dueTone: Record<DueStatus, BadgeTone> = {
  ok: 'success',
  upcoming: 'warning',
  overdue: 'danger',
};
const dueIcon: Record<DueStatus, IconName> = {
  ok: 'calendar-check',
  upcoming: 'calendar-clock',
  overdue: 'calendar-alert',
};

export function DueStatusBadge({ status }: { status: DueStatus }) {
  return (
    <Badge
      label={he.dueStatus[status]}
      tone={dueTone[status]}
      icon={dueIcon[status]}
      testID={`due-${status}`}
    />
  );
}

export const actionTypeIcon: Record<MaintenanceItemVM['actionType'], IconName> = {
  inspection: 'magnify',
  replacement: 'swap-horizontal',
  other: 'wrench-outline',
};

export function ActionTypeBadge({ type }: { type: MaintenanceItemVM['actionType'] }) {
  return <Badge label={he.actionType[type]} tone="neutral" icon={actionTypeIcon[type]} />;
}

interface RemainingStat {
  label: string;
  value: string;
  overdue: boolean;
}

/**
 * Remaining distance and time as separate stats. A negative value renders as an overrun (never
 * as "0"), so "650 km overdue but 25 days left" stays unambiguous.
 */
export function remainingStats(next: NextServiceVM): RemainingStat[] {
  const stats: RemainingStat[] = [];
  if (next.remainingKm != null) {
    const overdue = next.remainingKm < 0;
    stats.push({
      label: overdue ? he.home.kmOverdue : he.home.kmRemaining,
      value: formatKm(Math.abs(next.remainingKm)),
      overdue,
    });
  }
  if (next.remainingDays != null) {
    const overdue = next.remainingDays < 0;
    stats.push({
      label: overdue ? he.home.daysOverdue : he.home.daysRemaining,
      value: `${Math.abs(next.remainingDays)}${NBSP}${he.home.days}`,
      overdue,
    });
  }
  return stats;
}

export function dueAtText(next: NextServiceVM): string {
  return joinParts([
    next.dueAtKm != null ? formatKm(next.dueAtKm) : null,
    next.dueDate ? formatDate(next.dueDate) : null,
  ]);
}

/**
 * Next-service tile text (Home reference: date, then "בעוד N ימים"). Remaining time and distance
 * stay separate facts and an overrun is stated as such. The forecast (צפי) and the service title
 * are shown on the maintenance screen.
 */
export function nextServiceTile(next: NextServiceVM): { value: string; detail: string } {
  const value = next.dueDate
    ? formatDate(next.dueDate)
    : next.dueAtKm != null
      ? formatKm(next.dueAtKm)
      : next.title;
  // Reference: the date, then "בעוד N ימים" (distance when there is no date).
  const remaining =
    next.remainingDays != null
      ? next.remainingDays < 0
        ? he.home.daysLate(-next.remainingDays)
        : he.home.inDays(next.remainingDays)
      : next.remainingKm != null
        ? next.remainingKm < 0
          ? he.home.kmLate(formatKm(-next.remainingKm))
          : he.home.kmLeft(formatKm(next.remainingKm))
        : '';
  return { value, detail: remaining };
}

/** Top of Home / next-service screen: interval, remaining distance/time and labeled forecast. */
export function NextServiceSummary({ next }: { next: NextServiceVM }) {
  return (
    <Stack gap={spacing.sm} testID="next-service-summary">
      <Row>
        <AppText variant="title" style={styles.flex} accessibilityRole="header">
          {next.title}
        </AppText>
        <DueStatusBadge status={next.status} />
      </Row>
      <AppText variant="small" color="textSecondary">
        {next.intervalLabel}
      </AppText>
      <Row gap={spacing.lg} style={styles.wrap}>
        <Stat label={he.home.dueAt} value={dueAtText(next)} />
        {remainingStats(next).map((s) => (
          <Stat
            key={s.label}
            label={s.label}
            value={s.value}
            tone={s.overdue ? 'danger' : 'textPrimary'}
          />
        ))}
      </Row>
      {next.forecastDate ? (
        <ForecastValue value={formatDate(next.forecastDate)} testID="next-service-forecast" />
      ) : null}
    </Stack>
  );
}

function Stat({
  label,
  value,
  tone = 'textPrimary',
}: {
  label: string;
  value: string;
  tone?: 'textPrimary' | 'danger';
}) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="bodyStrong" color={tone}>
        {value}
      </AppText>
    </View>
  );
}

export function SourceLine({ source, onOpen }: { source: SourceRefVM; onOpen?: () => void }) {
  return (
    <View style={styles.source} testID="source-line">
      <Icon name="file-document-outline" size={18} color="primary" />
      <View style={styles.flex}>
        <AppText variant="smallStrong">
          {joinParts([source.sourceTitle, he.authority[source.authority]])}
        </AppText>
        {source.locator ? (
          <AppText variant="small" color="textSecondary">
            {source.locator}
          </AppText>
        ) : null}
        {source.version ? (
          <AppText variant="caption" color="textMuted">
            {source.version}
          </AppText>
        ) : null}
      </View>
      {onOpen ? (
        <Button label={he.maintenance.openSource} variant="ghost" onPress={onOpen} />
      ) : null}
    </View>
  );
}

/** Maintenance action that expands in place (no separate detail screen) — T018. */
export function MaintenanceItemRow({
  item,
  onOpenSource,
}: {
  item: MaintenanceItemVM;
  onOpenSource?: (documentId: string, locator?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View testID={`maintenance-item-${item.id}`}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${he.actionType[item.actionType]}`}
        accessibilityHint={he.maintenance.expandHint}
        accessibilityState={{ expanded: open }}
        android_ripple={{ color: colors.primarySoft }}
        style={styles.itemHeader}
      >
        <View style={styles.itemIcon}>
          <Icon name={actionTypeIcon[item.actionType]} size={20} color="primary" />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{item.title}</AppText>
          <AppText variant="small" color="textMuted">
            {he.actionType[item.actionType]}
          </AppText>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={22} color="textMuted" />
      </Pressable>
      {open ? (
        <View style={styles.itemBody} testID={`maintenance-item-${item.id}-details`}>
          <AppText variant="caption" color="textMuted">
            {he.maintenance.manufacturerSays}
          </AppText>
          <AppText>{item.manufacturerText}</AppText>
          <Row style={styles.wrap}>
            <ActionTypeBadge type={item.actionType} />
            <VerificationBadge state={item.verification} testID={`item-verification-${item.id}`} />
          </Row>
          {item.source ? (
            <SourceLine
              source={item.source}
              onOpen={
                item.source.documentId && onOpenSource
                  ? () => onOpenSource(item.source!.documentId!, item.source!.locator)
                  : undefined
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function MaintenanceItemList({
  items,
  onOpenSource,
}: {
  items: MaintenanceItemVM[];
  onOpenSource?: (documentId: string, locator?: string) => void;
}) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={item.id}>
          {i > 0 ? <Divider /> : null}
          <MaintenanceItemRow item={item} onOpenSource={onOpenSource} />
        </View>
      ))}
    </View>
  );
}

/**
 * Shown when no verified schedule exists: states it clearly, invents nothing, offers next steps.
 */
export function ScheduleUnavailable({
  schedule,
  onUploadManual,
}: {
  schedule: ScheduleVM;
  onUploadManual?: () => void;
}) {
  return (
    <Stack testID="schedule-unavailable">
      <VerificationBadge state={schedule.status} />
      <InlineNotice
        tone={schedule.status === 'pending' ? 'warning' : 'neutral'}
        title={he.home.scheduleUnavailableTitle}
        message={schedule.statusReason ?? he.onboarding.sourceNotFoundBody}
        action={
          onUploadManual
            ? { label: he.home.uploadManual, icon: 'file-upload-outline', onPress: onUploadManual }
            : undefined
        }
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
  stat: { gap: spacing.xxs, flexShrink: 1 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + 8,
    paddingVertical: spacing.sm,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { gap: spacing.sm, paddingBottom: spacing.md, paddingStart: 36 + spacing.md },
});
