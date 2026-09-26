import { useLocalSearchParams, useRouter } from 'expo-router';

import { useVehicleData } from '@/features/data/DataContext';
import { actionsFromSchedule, type DraftOrigin } from '@/features/service/draft';
import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { todayIso } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Card, ListRow, Screen, Stack, type IconName } from '@/ui';

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

  if (!activeVehicle) return null;

  const start = (origin: DraftOrigin, next: '/service/extract' | '/service/manual') => {
    setDraft({
      vehicleId: activeVehicle.id,
      origin,
      date: todayIso(),
      odometer: String(activeVehicle.odometerKm),
      garage: '',
      notes: '',
      actions: actionsFromSchedule(schedule.next?.items ?? [], item),
      uncertain: [],
    });
    router.push(next);
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
      subtitle: he.service.photoHint,
      onPress: () => start('document', '/service/extract'),
    },
    {
      id: 'file',
      icon: 'file-upload-outline',
      title: he.service.file,
      subtitle: he.service.fileHint,
      onPress: () => start('document', '/service/extract'),
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
