import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { newLocalId, useAppData, useVehicleData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import type { DocumentKind } from '@/features/data/types';
import { documentIcon } from '@/features/documents/icons';
import { useOpenDocument } from '@/features/documents/useOpenDocument';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import type { AcquiredFile } from '@/providers/acquisition/types';
import {
  AppText,
  Button,
  colors,
  Dialog,
  DocumentThumb,
  EmptyState,
  IconCircle,
  InlineNotice,
  ListRow,
  radii,
  Screen,
  spacing,
  Stack,
  UnderlineTabs,
  verificationLabel,
  TextField,
  type StatusTone,
} from '@/ui';

const KIND_ORDER: DocumentKind[] = [
  'owners_manual',
  'maintenance_schedule',
  'invoice',
  'registration',
  'insurance_compulsory',
  'insurance_other',
  'other',
];

const docTone: Record<DocumentKind, StatusTone> = {
  owners_manual: 'info',
  maintenance_schedule: 'success',
  invoice: 'danger',
  registration: 'info',
  insurance_compulsory: 'success',
  insurance_other: 'success',
  other: 'neutral',
};

/**
 * Vehicle-scoped document library (T023) after the approved "מסמכים" reference: filters by kind,
 * rows with the document's icon, details and a thumbnail, "add document" at the bottom. Tapping a
 * row opens the document itself; a long press opens its details (source, integrity, extraction).
 */
export default function DocumentsScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { documents } = useVehicleData(activeVehicle?.id ?? null);
  const [uploadInfo, setUploadInfo] = useState(false);
  const { isDemoData, addDocument } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  const [picked, setPicked] = useState<AcquiredFile | null>(null);
  /** "Other" chosen: the owner types the document's title (null = the kind list). */
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const closePicked = () => {
    setPicked(null);
    setCustomTitle(null);
  };
  const [problem, setProblem] = useState<string | null>(null);
  const { open, problem: openProblem } = useOpenDocument();

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

  /** The title is the kind's name, or the owner's own title for "other" (no upload date). */
  const save = (kind: DocumentKind, title: string = he.documents.kinds[kind]) => {
    if (!picked || !activeVehicle) return;
    addDocument(activeVehicle.id, { documentId: newLocalId('doc'), file: picked, title }, kind);
    closePicked();
  };
  const customReady = (customTitle ?? '').trim().length > 0;

  const [filter, setFilter] = useState<'all' | DocumentKind>('all');
  const kindsPresent = KIND_ORDER.filter((k) => documents.some((d) => d.kind === k));
  const kindsShown = filter === 'all' ? kindsPresent : kindsPresent.filter((k) => k === filter);

  return (
    <Screen
      header={<ScreenHeader title={he.documents.title} onBack={() => router.navigate('/')} />}
      edges={['top']}
      testID="screen-documents"
      footer={
        <Button
          testID="documents-upload"
          label={he.documents.add}
          icon="camera-outline"
          fullWidth
          onPress={() => void pick()}
        />
      }
    >
      {uploadInfo ? <InlineNotice tone="info" message={he.documents.uploadUnavailable} /> : null}
      {problem ? (
        <InlineNotice testID="documents-upload-problem" tone="warning" message={problem} />
      ) : null}
      {openProblem ? (
        <InlineNotice testID="documents-open-problem" tone="warning" message={openProblem} />
      ) : null}
      <Dialog
        visible={picked !== null}
        testID="documents-kind-dialog"
        title={he.documents.chooseKind}
        message={he.documents.uploadedNote}
        {...(customTitle === null
          ? {
              confirmLabel: he.common.cancel,
              onConfirm: closePicked,
              cancelLabel: he.common.close,
              onCancel: closePicked,
            }
          : {
              confirmLabel: he.documents.save,
              confirmDisabled: !customReady,
              onConfirm: () => {
                if (customReady) save('other', (customTitle ?? '').trim());
              },
              cancelLabel: he.documents.back,
              onCancel: () => setCustomTitle(null),
            })}
      >
        {customTitle === null ? (
          <Stack gap={0}>
            {KIND_ORDER.map((kind) => (
              <ListRow
                key={kind}
                testID={`documents-kind-${kind}`}
                icon={documentIcon[kind]}
                title={he.documents.kinds[kind]}
                onPress={() => (kind === 'other' ? setCustomTitle('') : save(kind))}
              />
            ))}
          </Stack>
        ) : (
          <TextField
            testID="documents-custom-title"
            label={he.documents.customTitleLabel}
            value={customTitle}
            onChangeText={setCustomTitle}
            placeholder={he.documents.customTitlePlaceholder}
            maxLength={80}
            required
          />
        )}
      </Dialog>
      {documents.length === 0 ? (
        <EmptyState icon="file-document-multiple-outline" title={he.documents.empty} />
      ) : (
        <>
          <UnderlineTabs
            testID="documents-filter"
            accessibilityLabel={he.documents.title}
            value={kindsPresent.includes(filter as DocumentKind) ? filter : 'all'}
            onChange={setFilter}
            options={[
              { value: 'all', label: he.documents.allDocuments },
              ...kindsPresent
                .slice(0, 3)
                .map((k) => ({ value: k, label: he.documents.kindShort[k] })),
            ]}
          />
          {kindsShown.map((kind) => (
            <View key={kind} testID={`documents-group-${kind}`} style={styles.group}>
              {documents
                .filter((d) => d.kind === kind)
                .map((d) => (
                  <Pressable
                    key={d.id}
                    testID={`document-${d.id}`}
                    onPress={() => void open(d)}
                    onLongPress={() => router.push(`/documents/${d.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.title}, ${verificationLabel(d.verification)}`}
                    accessibilityHint={he.documents.openHint}
                    accessibilityActions={[{ name: 'longpress', label: he.documents.details }]}
                    onAccessibilityAction={() => router.push(`/documents/${d.id}`)}
                    android_ripple={{ color: colors.primarySoft }}
                    style={styles.docRow}
                  >
                    <DocumentThumb mimeType={d.mimeType} icon={documentIcon[d.kind]} size={58} />
                    <View style={styles.docText}>
                      <AppText variant="heading" numberOfLines={2}>
                        {d.title}
                      </AppText>
                      <AppText variant="small" color="textSecondary">
                        {joinParts([
                          he.documents.kindShort[d.kind],
                          d.pages ? he.documents.pages(d.pages) : null,
                        ])}
                      </AppText>
                      <AppText variant="caption" color="textMuted">
                        {`${he.authority[d.authority]} · ${verificationLabel(d.verification)}`}
                      </AppText>
                    </View>
                    <IconCircle icon={documentIcon[d.kind]} tone={docTone[d.kind]} size={48} />
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  docText: { flex: 1, gap: spacing.xxs },
});
