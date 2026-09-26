import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import { documentExporter } from '@/features/data/dataSource';
import { buildDossierHtml, readingSource } from '@/features/dossier/dossierHtml';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { formatDate, formatKm, joinParts, SEP } from '@/features/vehicles/format';
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
  const { vehicles, getBundle, isDemoData, today } = useAppData();
  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const vehicle = vehicles.find((v) => v.id === id);

  if (!vehicle) {
    return (
      <Screen header={<ScreenHeader title={he.dossier.title} />}>
        <EmptyState icon="folder-alert-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }
  const bundle = getBundle(vehicle.id);
  const { history, documents } = bundle;
  // Real recorded readings with their source; prototype data only has the latest reading.
  const readings = (
    bundle.readings ?? [
      {
        id: 'latest',
        date: vehicle.odometerMeasuredAt,
        km: vehicle.odometerKm,
        source: 'user' as const,
      },
    ]
  )
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  // T149: PDF through the system share sheet — the user decides where it goes.
  const share = async () => {
    const exporter = isDemoData ? null : documentExporter();
    if (!exporter) return setShareInfo(he.dossier.shareUnavailable);
    setSharing(true);
    setShareInfo(null);
    try {
      const html = buildDossierHtml(vehicle, bundle, today());
      if (!(await exporter.shareHtml(html, he.dossier.title))) setShareInfo(he.dossier.shareFailed);
    } catch (e) {
      // Dev builds show the technical cause to speed up diagnosis; users see plain language.
      setShareInfo(
        __DEV__
          ? `${he.dossier.shareFailed}
${String(e)}`
          : he.dossier.shareFailed,
      );
    } finally {
      setSharing(false);
    }
  };

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
          loading={sharing}
          disabled={sharing}
          onPress={() => void share()}
        />
      }
    >
      <AppText color="textSecondary">{he.dossier.intro}</AppText>
      {shareInfo ? (
        <InlineNotice testID="dossier-share-info" tone="info" message={shareInfo} />
      ) : null}

      <Card>
        <SectionHeader title={he.dossier.vehicleDetails} />
        <AppText variant="heading">{vehicleDisplayName(vehicle)}</AppText>
        <AppText color="textSecondary">
          {joinParts([he.vehicleType[vehicle.kind], vehicle.registration])}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {he.dossier.generatedAt}: {formatDate(today())}
        </AppText>
      </Card>

      <Card testID="dossier-readings">
        <SectionHeader title={he.dossier.odometerReadings} />
        {readings.map((r, i) => (
          <View key={r.id}>
            {i > 0 ? <Divider /> : null}
            <Stack gap={spacing.xs} style={styles.event}>
              <Row>
                <AppText style={styles.flex}>{formatDate(r.date)}</AppText>
                <AppText variant="bodyStrong">{formatKm(r.km)}</AppText>
              </Row>
              <Badge
                label={readingSource(r)}
                tone={r.source === 'user' || r.source === 'onboarding' ? 'neutral' : 'info'}
              />
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
