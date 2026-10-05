import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/DataContext';
import type { ServiceEventVM } from '@/features/data/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  colors,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  radii,
  Screen,
  spacing,
  Stack,
} from '@/ui';

type Filter = 'all' | 'garage' | 'user' | 'withDocument';

const matches: Record<Filter, (e: ServiceEventVM) => boolean> = {
  all: () => true,
  garage: (e) => e.sourceAuthority === 'garage_document',
  user: (e) => e.sourceAuthority === 'user_report',
  withDocument: (e) => e.documentIds.length > 0,
};

/**
 * Service history (T022), reproducing the approved "היסטוריית טיפולים" reference (flow image,
 * screen 10): header, the "all services" filter, and one card per recorded service — the check
 * marker, km, date, what was done, notes, and "view document and source". History reflects what
 * was recorded, never the manufacturer schedule.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { history } = useVehicleData(activeVehicle?.id ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const [choosing, setChoosing] = useState(false);
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const shown = sorted.filter(matches[filter]);

  return (
    <Screen
      header={
        <ScreenHeader
          title={he.history.title}
          onBack={() => router.navigate('/')}
          trailing={
            <IconButton
              testID="history-add"
              icon="plus"
              accessibilityLabel={he.history.add}
              onPress={() => router.push('/service/new')}
            />
          }
        />
      }
      edges={['top']}
      testID="screen-history"
    >
      {sorted.length === 0 ? (
        <EmptyState
          testID="history-empty"
          icon="clipboard-text-clock-outline"
          title={he.history.empty}
          message={he.history.emptyBody}
          action={{
            label: he.history.add,
            icon: 'plus',
            onPress: () => router.push('/service/new'),
          }}
        />
      ) : (
        <>
          <Pressable
            testID="history-filter"
            onPress={() => setChoosing(true)}
            accessibilityRole="button"
            accessibilityLabel={`${he.history.filterLabel}: ${he.history.filters[filter]}`}
            style={styles.dropdown}
          >
            <AppText variant="smallStrong" style={styles.flex}>
              {filter === 'all' ? he.history.allServices : he.history.filters[filter]}
            </AppText>
            <Icon name="chevron-down" size={22} color="textPrimary" />
          </Pressable>
          {shown.length === 0 ? (
            <EmptyState icon="filter-variant-remove" title={he.history.emptyFilter} />
          ) : (
            <Stack testID="history-list">
              {shown.map((e) => (
                <HistoryCard key={e.id} event={e} onPress={() => router.push(`/service/${e.id}`)} />
              ))}
            </Stack>
          )}
        </>
      )}
      <Dialog
        visible={choosing}
        testID="history-filter-dialog"
        title={he.history.filterLabel}
        confirmLabel={he.common.close}
        onConfirm={() => setChoosing(false)}
        onCancel={() => setChoosing(false)}
      >
        <Stack gap={0}>
          {(Object.keys(matches) as Filter[]).map((f) => (
            <ListRow
              key={f}
              testID={`history-filter-${f}`}
              title={`${f === 'all' ? he.history.allServices : he.history.filters[f]} (${sorted.filter(matches[f]).length})`}
              icon={f === filter ? 'check' : undefined}
              onPress={() => {
                setFilter(f);
                setChoosing(false);
              }}
            />
          ))}
        </Stack>
      </Dialog>
    </Screen>
  );
}

function HistoryCard({ event, onPress }: { event: ServiceEventVM; onPress: () => void }) {
  const performed = event.actions.filter((a) => a.performed);
  const verified = event.verification === 'verified';
  return (
    <Pressable
      testID={`history-item-${event.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatDate(event.date)}, ${formatKm(event.odometerKm)}, ${he.history.actions(performed.length)}`}
      android_ripple={{ color: colors.primarySoft }}
      style={styles.card}
    >
      <View style={styles.text}>
        <AppText variant="heading">{formatKm(event.odometerKm)}</AppText>
        <AppText variant="small" color="textSecondary">
          {formatDate(event.date)}
        </AppText>
        <AppText variant="small" numberOfLines={2}>
          {joinParts(performed.map((a) => a.title))}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {joinParts([event.garage, event.notes ? `${he.history.notes}: ${event.notes}` : null])}
        </AppText>
        {/* Who reported it and how (owner decision 2026-10-05): e.g. "דיווח משתמש · הזנה ידנית" —
            never "חסר מידע / ממתין לאימות" for the owner's own past service. */}
        <View style={styles.source} testID={`history-item-${event.id}-source`}>
          <Badge
            label={`${he.authority[event.sourceAuthority]} · ${he.history.origin[event.origin]}`}
            tone="neutral"
          />
        </View>
        {event.documentIds.length > 0 ? (
          <AppText variant="smallStrong" color="primary">
            {he.history.viewDocumentAndSource}
          </AppText>
        ) : null}
      </View>
      <View
        style={[
          styles.marker,
          { backgroundColor: verified ? colors.successStrong : colors.textDisabled },
        ]}
      >
        <Icon name="check" size={26} color="textOnPrimary" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  source: { flexDirection: 'row' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, gap: spacing.xxs },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
