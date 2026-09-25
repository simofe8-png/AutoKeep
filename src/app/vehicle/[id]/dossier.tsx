import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePrototypeData } from '@/features/data/PrototypeDataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { formatDate, formatKm, joinParts, SEP, todayIso } from '@/features/vehicles/format';
import { vehicleDisplayName } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  InlineNotice,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  VerificationBadge,
} from '@/ui';

/**
 * Vehicle dossier preview (T029): generated from existing source-of-truth data, not a competing
 * history. Provenance stays visible; user-reported facts are labeled as such.
 */
export default function DossierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle } = usePrototypeData();
  const [shareInfo, setShareInfo] = useState(false);
  const vehicle = vehicles.find((v) => v.id === id);

  if (!vehicle) {
    return (
      <Screen header={<ScreenHeader title={he.dossier.title} />}>
        <EmptyState icon="folder-alert-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }
  const { history, documents } = getBundle(vehicle.id);
  const readings = [
    { date: vehicle.odometerMeasuredAt, km: vehicle.odometerKm, userReported: true },
    ...history.map((e) => ({
      date: e.date,
      km: e.odometerKm,
      userReported: e.sourceAuthority === 'user_report',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen
      testID="screen-dossier"
      header={<ScreenHeader title={he.dossier.title} />}
      footer={
        <Button
          testID="dossier-share"
          label={he.dossier.share}
          icon="share-variant-outline"
          fullWidth
          onPress={() => setShareInfo(true)}
        />
      }
    >
      <AppText color="textSecondary">{he.dossier.intro}</AppText>
      {shareInfo ? <InlineNotice tone="info" message={he.dossier.shareUnavailable} /> : null}

      <Card>
        <SectionHeader title={he.dossier.vehicleDetails} />
        <AppText variant="heading">{vehicleDisplayName(vehicle)}</AppText>
        <AppText color="textSecondary">
          {joinParts([he.vehicleType[vehicle.kind], vehicle.registration])}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {he.dossier.generatedAt}: {formatDate(todayIso())}
        </AppText>
      </Card>

      <Card testID="dossier-readings">
        <SectionHeader title={he.dossier.odometerReadings} />
        {readings.map((r, i) => (
          <View key={`${r.date}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <Stack gap={spacing.xs} style={styles.event}>
              <Row>
                <AppText style={styles.flex}>{formatDate(r.date)}</AppText>
                <AppText variant="bodyStrong">{formatKm(r.km)}</AppText>
              </Row>
              {r.userReported ? <Badge label={he.dossier.userReported} tone="neutral" /> : null}
            </Stack>
          </View>
        ))}
      </Card>

      <Card testID="dossier-history">
        <SectionHeader title={he.dossier.serviceHistory} />
        {history.length === 0 ? (
          <AppText color="textMuted">{he.garage.noHistory}</AppText>
        ) : (
          history.map((e, i) => (
            <View key={e.id} testID={`dossier-event-${e.id}`}>
              {i > 0 ? <Divider /> : null}
              <Stack gap={spacing.xs} style={styles.event}>
                <Row>
                  <AppText variant="bodyStrong" style={styles.flex}>
                    {joinParts([formatDate(e.date), formatKm(e.odometerKm)])}
                  </AppText>
                </Row>
                <AppText variant="small" color="textSecondary">
                  {e.actions
                    .filter((a) => a.performed)
                    .map((a) => a.title)
                    .join(SEP)}
                </AppText>
                <Row style={styles.wrap}>
                  <VerificationBadge state={e.verification} />
                  {e.sourceAuthority === 'user_report' ? (
                    <Badge label={he.dossier.userReported} tone="neutral" />
                  ) : (
                    <Badge label={he.authority[e.sourceAuthority]} tone="neutral" />
                  )}
                </Row>
              </Stack>
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionHeader title={he.dossier.documents} />
        {documents.map((d) => (
          <Row key={d.id} style={styles.line}>
            <AppText style={styles.flex}>{d.title}</AppText>
            <VerificationBadge state={d.verification} />
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
  line: { paddingVertical: spacing.sm },
  event: { paddingVertical: spacing.sm },
});
