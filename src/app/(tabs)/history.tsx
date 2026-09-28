import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/DataContext';
import type { DocumentVM, ServiceEventVM } from '@/features/data/types';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, joinParts } from '@/features/vehicles/format';
import { VehicleSelectorCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  DocumentThumb,
  EmptyState,
  FilterChips,
  PageTitle,
  Screen,
  spacing,
  TimelineItem,
  VerificationBadge,
} from '@/ui';

type Filter = 'all' | 'garage' | 'user' | 'withDocument';

const matches: Record<Filter, (e: ServiceEventVM) => boolean> = {
  all: () => true,
  garage: (e) => e.sourceAuthority === 'garage_document',
  user: (e) => e.sourceAuthority === 'user_report',
  withDocument: (e) => e.documentIds.length > 0,
};

/**
 * Service history (T022) after the approved "היסטוריית טיפולים" reference: filters, a timeline of
 * the recorded services with the attached document, provenance on every record. History reflects
 * what was recorded — never the manufacturer schedule.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { history, alerts, documents } = useVehicleData(activeVehicle?.id ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const alertCount = alerts.filter((a) => !a.handled).length;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const shown = sorted.filter(matches[filter]);
  const count = (f: Filter) => sorted.filter(matches[f]).length;

  return (
    <Screen header={<AppHeader alertCount={alertCount} />} edges={['top']} testID="screen-history">
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
          {activeVehicle ? (
            <VehicleSelectorCard vehicle={activeVehicle} onPress={() => router.push('/vehicles')} />
          ) : null}
          <PageTitle
            title={he.history.title}
            action={
              <Button
                testID="history-add"
                label={he.history.add}
                icon="plus"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/service/new')}
              />
            }
          />
          <AppText variant="small" color="textMuted">
            {he.history.historyNotSchedule}
          </AppText>
          <FilterChips
            testID="history-filter"
            accessibilityLabel={he.history.title}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: he.history.filters.all, count: count('all') },
              { value: 'garage', label: he.history.filters.garage, count: count('garage') },
              { value: 'user', label: he.history.filters.user, count: count('user') },
              {
                value: 'withDocument',
                label: he.history.filters.withDocument,
                count: count('withDocument'),
              },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState icon="filter-variant-remove" title={he.history.emptyFilter} />
          ) : (
            <View testID="history-list">
              {shown.map((e, i) => (
                <HistoryEntry
                  key={e.id}
                  event={e}
                  document={documents.find((d) => d.id === e.documentIds[0])}
                  first={i === 0}
                  last={i === shown.length - 1}
                  onPress={() => router.push(`/service/${e.id}`)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function HistoryEntry({
  event,
  document,
  first,
  last,
  onPress,
}: {
  event: ServiceEventVM;
  document?: DocumentVM;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const performed = event.actions.filter((a) => a.performed);
  return (
    <TimelineItem
      testID={`history-item-${event.id}`}
      status={event.verification === 'verified' ? 'done' : 'pending'}
      first={first}
      last={last}
      onPress={onPress}
      accessibilityLabel={`${formatDate(event.date)}, ${formatKm(event.odometerKm)}, ${he.history.actions(performed.length)}`}
    >
      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="bodyStrong">
            {joinParts([formatKm(event.odometerKm), formatDate(event.date)])}
          </AppText>
          <AppText variant="small" color="textSecondary" numberOfLines={2}>
            {joinParts(performed.map((a) => a.title))}
          </AppText>
          <View style={styles.badges}>
            <VerificationBadge state={event.verification} />
            <Badge label={he.authority[event.sourceAuthority]} tone="neutral" />
          </View>
          {event.documentIds.length > 0 ? (
            <AppText variant="smallStrong" color="primary">
              {he.history.viewDocumentAndSource}
            </AppText>
          ) : null}
        </View>
        {event.documentIds.length > 0 ? (
          <DocumentThumb
            mimeType={document?.mimeType ?? 'application/pdf'}
            icon="receipt"
            size={52}
          />
        ) : null}
      </View>
    </TimelineItem>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: spacing.xxs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
