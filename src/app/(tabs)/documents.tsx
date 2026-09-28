import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { newLocalId, useAppData, useVehicleData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import type { DocumentKind } from '@/features/data/types';
import { documentIcon } from '@/features/documents/icons';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, joinParts } from '@/features/vehicles/format';
import { VehicleSelectorCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import type { AcquiredFile } from '@/providers/acquisition/types';
import {
  AppText,
  Button,
  colors,
  Dialog,
  DocumentThumb,
  EmptyState,
  FilterChips,
  IconCircle,
  InlineNotice,
  ListRow,
  PageTitle,
  radii,
  Screen,
  spacing,
  Stack,
  VerificationBadge,
  verificationLabel,
  type StatusTone,
} from '@/ui';

const KIND_ORDER: DocumentKind[] = [
  'owners_manual',
  'maintenance_schedule',
  'invoice',
  'registration',
  'other',
];

const docTone: Record<DocumentKind, StatusTone> = {
  owners_manual: 'info',
  maintenance_schedule: 'success',
  invoice: 'danger',
  registration: 'info',
  other: 'neutral',
};

/**
 * Vehicle-scoped document library (T023) after the approved "מסמכים" reference: filters by kind,
 * rows with the document's icon, details and a thumbnail, "add document" at the bottom.
 */
export default function DocumentsScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { documents, alerts } = useVehicleData(activeVehicle?.id ?? null);
  const [uploadInfo, setUploadInfo] = useState(false);
  const { isDemoData, addDocument, today } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  const [picked, setPicked] = useState<AcquiredFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** Real mode: pick the file first, then say what it is (the original is kept as-is). */
  const pick = async () => {
    if (!services) return setUploadInfo(true);
    setProblem(null);
    const r = await services.acquisition.pickDocument();
    if (r.status === 'cancelled') return;
    if (r.status !== 'acquired') {
      return setProblem(
        r.status === 'rejected' ? he.onboarding.fileRejected : he.states.genericErrorTitle,
      );
    }
    setPicked(r.file);
  };

  const save = (kind: DocumentKind) => {
    if (!picked || !activeVehicle) return;
    addDocument(
      activeVehicle.id,
      {
        documentId: newLocalId('doc'),
        file: picked,
        title: he.documents.uploadTitle(he.documents.kinds[kind], formatDate(today())),
      },
      kind,
    );
    setPicked(null);
  };
  const alertCount = alerts.filter((a) => !a.handled).length;

  const [filter, setFilter] = useState<'all' | DocumentKind>('all');
  const kindsPresent = KIND_ORDER.filter((k) => documents.some((d) => d.kind === k));
  const kindsShown = filter === 'all' ? kindsPresent : kindsPresent.filter((k) => k === filter);

  return (
    <Screen
      header={<AppHeader alertCount={alertCount} />}
      edges={['top']}
      testID="screen-documents"
      footer={
        <Button
          testID="documents-upload"
          label={he.documents.add}
          icon="file-upload-outline"
          fullWidth
          onPress={() => void pick()}
        />
      }
    >
      {activeVehicle ? (
        <VehicleSelectorCard vehicle={activeVehicle} onPress={() => router.push('/vehicles')} />
      ) : null}
      <PageTitle title={he.documents.title} />
      {uploadInfo ? <InlineNotice tone="info" message={he.documents.uploadUnavailable} /> : null}
      {problem ? (
        <InlineNotice testID="documents-upload-problem" tone="warning" message={problem} />
      ) : null}
      <Dialog
        visible={picked !== null}
        testID="documents-kind-dialog"
        title={he.documents.chooseKind}
        message={he.documents.uploadedNote}
        confirmLabel={he.common.cancel}
        onConfirm={() => setPicked(null)}
        cancelLabel={he.common.close}
        onCancel={() => setPicked(null)}
      >
        <Stack gap={0}>
          {KIND_ORDER.map((kind) => (
            <ListRow
              key={kind}
              testID={`documents-kind-${kind}`}
              icon={documentIcon[kind]}
              title={he.documents.kinds[kind]}
              onPress={() => save(kind)}
            />
          ))}
        </Stack>
      </Dialog>
      {documents.length === 0 ? (
        <EmptyState icon="file-document-multiple-outline" title={he.documents.empty} />
      ) : (
        <>
          <FilterChips
            testID="documents-filter"
            accessibilityLabel={he.documents.title}
            value={kindsPresent.includes(filter as DocumentKind) ? filter : 'all'}
            onChange={setFilter}
            options={[
              { value: 'all', label: he.documents.allDocuments, count: documents.length },
              ...kindsPresent.map((k) => ({
                value: k,
                label: he.documents.kindShort[k],
                count: documents.filter((d) => d.kind === k).length,
              })),
            ]}
          />
          {kindsShown.map((kind) => (
            <View key={kind} testID={`documents-group-${kind}`} style={styles.group}>
              <AppText variant="smallStrong" color="textSecondary">
                {he.documents.kinds[kind]}
              </AppText>
              {documents
                .filter((d) => d.kind === kind)
                .map((d) => (
                  <Pressable
                    key={d.id}
                    testID={`document-${d.id}`}
                    onPress={() => router.push(`/documents/${d.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.title}, ${verificationLabel(d.verification)}`}
                    android_ripple={{ color: colors.primarySoft }}
                    style={styles.docRow}
                  >
                    <IconCircle icon={documentIcon[d.kind]} tone={docTone[d.kind]} size={48} />
                    <View style={styles.docText}>
                      <AppText variant="bodyStrong" numberOfLines={2}>
                        {d.title}
                      </AppText>
                      <AppText variant="small" color="textMuted">
                        {joinParts([
                          formatDate(d.addedAt),
                          d.pages ? he.documents.pages(d.pages) : null,
                          he.authority[d.authority],
                        ])}
                      </AppText>
                      <VerificationBadge state={d.verification} />
                    </View>
                    <DocumentThumb mimeType={d.mimeType} icon={documentIcon[d.kind]} size={52} />
                  </Pressable>
                ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  docText: { flex: 1, gap: spacing.xxs },
});
