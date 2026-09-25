import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useVehicleData } from '@/features/data/PrototypeDataContext';
import type { DocumentKind } from '@/features/data/types';
import { documentIcon } from '@/features/documents/icons';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  InlineNotice,
  ListRow,
  Row,
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
  const alertCount = alerts.filter((a) => !a.handled).length;

  const upload = (
    <Button
      testID="documents-upload"
      label={he.documents.upload}
      icon="file-upload-outline"
      variant="secondary"
      onPress={() => setUploadInfo(true)}
    />
  );

  return (
    <Screen
      header={<AppHeader alertCount={alertCount} compact />}
      edges={['top']}
      testID="screen-documents"
    >
      <Row>
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {he.documents.title}
        </AppText>
        {upload}
      </Row>
      {uploadInfo ? <InlineNotice tone="info" message={he.documents.uploadUnavailable} /> : null}
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
                      subtitle={[
                        formatDate(d.addedAt),
                        d.pages ? he.documents.pages(d.pages) : null,
                        he.authority[d.authority],
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={<VerificationBadge state={d.verification} />}
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
