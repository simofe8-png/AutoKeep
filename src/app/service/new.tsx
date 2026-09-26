import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { newLocalId, useAppData, useVehicleData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { actionsFromSchedule, type DraftOrigin } from '@/features/service/draft';
import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import type { AcquisitionResult } from '@/providers/acquisition/types';
import { AppText, Card, InlineNotice, ListRow, Screen, Stack, type IconName } from '@/ui';

/**
 * Service capture entry (T020): photo invoice / uploaded file / manual. Manual is always
 * available. The target vehicle is shown to prevent misfiling.
 */
export default function NewServiceScreen() {
  const router = useRouter();
  const { item } = useLocalSearchParams<{ item?: string }>();
  const { activeVehicle } = useActiveVehicle();
  const { schedule } = useVehicleData(activeVehicle?.id ?? null);
  const { setDraft } = useServiceDraft();
  const { isDemoData, today: todayOf } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  const [problem, setProblem] = useState<string | null>(null);

  if (!activeVehicle) return null;

  const start = (
    origin: DraftOrigin,
    next: '/service/extract' | '/service/manual',
    acquired?: Extract<AcquisitionResult, { status: 'acquired' }>,
  ) => {
    const today = todayOf();
    setDraft({
      vehicleId: activeVehicle.id,
      origin,
      date: today,
      odometer: String(activeVehicle.odometerKm),
      garage: '',
      notes: '',
      actions: actionsFromSchedule(schedule.next?.items ?? [], item),
      uncertain: [],
      ...(acquired
        ? {
            attachment: {
              documentId: newLocalId('doc'),
              file: acquired.file,
              title: he.service.invoiceTitle(formatDate(today)),
            },
            documentTitle: he.service.invoiceTitle(formatDate(today)),
          }
        : {}),
    });
    router.push(next);
  };

  /** Outside demo mode the invoice is really captured / picked (acquisition boundary). */
  const fromDocument = (how: 'camera' | 'file') => async () => {
    if (!services) return start('document', '/service/extract');
    setProblem(null);
    const a = services.acquisition;
    const r = how === 'camera' ? await a.captureWithCamera() : await a.pickDocument();
    if (r.status === 'cancelled') return;
    if (r.status !== 'acquired') {
      return setProblem(
        r.status === 'permission_denied'
          ? he.onboarding.permissionDenied
          : r.status === 'rejected'
            ? he.onboarding.fileRejected
            : he.service.readingFailed,
      );
    }
    start('document', '/service/extract', r);
  };

  const methods: {
    id: string;
    icon: IconName;
    title: string;
    subtitle: string;
    onPress: () => void;
  }[] = [
    {
      id: 'photo',
      icon: 'camera-outline',
      title: he.service.photo,
      subtitle:
        services && !services.invoiceReader ? he.service.photoHintNoReader : he.service.photoHint,
      onPress: fromDocument('camera'),
    },
    {
      id: 'file',
      icon: 'file-upload-outline',
      title: he.service.file,
      subtitle: he.service.fileHint,
      onPress: fromDocument('file'),
    },
    {
      id: 'manual',
      icon: 'form-textbox',
      title: he.service.manual,
      subtitle: he.service.manualHint,
      onPress: () => start('manual', '/service/manual'),
    },
  ];

  return (
    <Screen
      testID="screen-service-new"
      header={<ScreenHeader title={he.service.newTitle} closeIcon />}
    >
      <VehicleTargetBanner vehicle={activeVehicle} />
      <AppText variant="heading">{he.service.chooseMethod}</AppText>
      {problem ? (
        <InlineNotice testID="service-capture-problem" tone="warning" message={problem} />
      ) : null}
      <Stack>
        {methods.map((m) => (
          <Card key={m.id} compact>
            <ListRow
              testID={`service-method-${m.id}`}
              icon={m.icon}
              title={m.title}
              subtitle={m.subtitle}
              onPress={m.onPress}
            />
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
