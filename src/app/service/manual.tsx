import { useRouter } from 'expo-router';
import { useState } from 'react';

import { hasErrors, validateDraft } from '@/features/service/draft';
import { ServiceForm } from '@/features/service/ServiceForm';
import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { todayIso } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { Button, Screen } from '@/ui';

/** Manual service entry (always available). Leads to review + explicit confirmation. */
export default function ManualServiceScreen() {
  const router = useRouter();
  const { draft, update } = useServiceDraft();
  const { vehicles } = useActiveVehicle();
  const [showErrors, setShowErrors] = useState(false);
  const vehicle = vehicles.find((v) => v.id === draft?.vehicleId);

  if (!draft || !vehicle) return null;
  const errors = validateDraft(draft, todayIso());

  return (
    <Screen
      testID="screen-service-manual"
      header={<ScreenHeader title={he.service.manual} />}
      footer={
        <Button
          testID="service-to-review"
          label={he.service.review}
          fullWidth
          onPress={() => {
            if (hasErrors(errors)) return setShowErrors(true);
            router.push('/service/review');
          }}
        />
      }
    >
      <VehicleTargetBanner vehicle={vehicle} />
      <ServiceForm draft={draft} onChange={update} errors={errors} showErrors={showErrors} />
    </Screen>
  );
}
