import { useRouter } from 'expo-router';
import { useState } from 'react';

import { newLocalId, useAppData, useVehicleData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import type { DocumentKind } from '@/features/data/types';
import { documentIcon } from '@/features/documents/icons';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import type { AcquiredFile } from '@/providers/acquisition/types';
import {
  Button,
  Card,
  Dialog,
  Divider,
  EmptyState,
  InlineNotice,
  ListRow,
  PageTitle,
  Screen,
  SectionHeader,
  Stack,
  VerificationBadge,
} from '@/ui';

const KIND_ORDER: DocumentKind[] = [
  'owners_manual',
  'maintenance_schedule',
  'invoice',
  'registration',
  'other',
];

/** Vehicle-scoped document library (T023). */
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

  const upload = (
    <Button
      testID="documents-upload"
      label={he.documents.upload}
      icon="file-upload-outline"
      variant="secondary"
      onPress={() => void pick()}
    />
  );

  return (
    <Screen
      header={<AppHeader alertCount={alertCount} compact />}
      edges={['top']}
      testID="screen-documents"
    >
      <PageTitle title={he.documents.title} action={upload} />
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
        <Stack>
          {KIND_ORDER.map((kind) => {
            const docs = documents.filter((d) => d.kind === kind);
            if (docs.length === 0) return null;
            return (
              <Card key={kind} compact testID={`documents-group-${kind}`}>
                <SectionHeader title={he.documents.kinds[kind]} />
                {docs.map((d, i) => (
                  <Stack key={d.id} gap={0}>
                    {i > 0 ? <Divider /> : null}
                    <ListRow
                      testID={`document-${d.id}`}
                      icon={documentIcon[d.kind]}
                      title={d.title}
                      subtitle={joinParts([
                        formatDate(d.addedAt),
                        d.pages ? he.documents.pages(d.pages) : null,
                        he.authority[d.authority],
                      ])}
                      below={<VerificationBadge state={d.verification} />}
                      onPress={() => router.push(`/documents/${d.id}`)}
                    />
                  </Stack>
                ))}
              </Card>
            );
          })}
        </Stack>
      )}
    </Screen>
  );
}
