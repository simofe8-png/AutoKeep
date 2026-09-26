import { useRouter } from 'expo-router';
import { useState } from 'react';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { draftToEvent, hasErrors, validateDraft } from '@/features/service/draft';
import { ServiceForm } from '@/features/service/ServiceForm';
import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { todayIso } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Button, Card, Dialog, Icon, InlineNotice, Row, Screen, spacing } from '@/ui';

/**
 * Review & explicit confirmation (T021). Document-derived drafts never auto-commit: the user
 * reviews, corrects, and confirms in a dialog that names the target vehicle.
 */
export default function ReviewServiceScreen() {
  const router = useRouter();
  const { draft, update, setDraft } = useServiceDraft();
  const { vehicles } = useActiveVehicle();
  const { addServiceEvent } = useAppData();
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const vehicle = vehicles.find((v) => v.id === draft?.vehicleId);

  if (!draft || !vehicle) return null;
  const errors = validateDraft(draft, todayIso());

  return (
    <Screen
      testID="screen-service-review"
      header={<ScreenHeader title={he.service.reviewTitle} />}
      footer={
        <Button
          testID="service-confirm"
          label={he.service.confirmSave}
          icon="check"
          fullWidth
          onPress={() => (hasErrors(errors) ? setShowErrors(true) : setConfirming(true))}
        />
      }
    >
      <VehicleTargetBanner vehicle={vehicle} />
      <AppText color="textSecondary">{he.service.reviewBody}</AppText>
      {draft.origin === 'document' ? (
        <>
          <InlineNotice
            tone="warning"
            title={he.service.draftFromDocument}
            message={he.service.photoHint}
          />
          {draft.documentTitle ? (
            <Card tone="muted" testID="review-original-document">
              <Row gap={spacing.sm}>
                <Icon name="file-document-outline" size={24} color="primary" />
                <AppText variant="small" color="textMuted">
                  {he.service.originalDocument}:
                </AppText>
                <AppText variant="smallStrong">{draft.documentTitle}</AppText>
              </Row>
            </Card>
          ) : null}
        </>
      ) : null}

      <ServiceForm draft={draft} onChange={update} errors={errors} showErrors={showErrors} />

      <Dialog
        visible={confirming}
        testID="service-confirm-dialog"
        title={he.service.confirmDialogTitle}
        message={he.service.confirmDialogBody}
        confirmLabel={he.service.confirmSave}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          addServiceEvent(draftToEvent(draft, newLocalId('svc')));
          setConfirming(false);
          setDraft(null);
          router.dismissTo('/history');
        }}
      >
        <VehicleTargetBanner vehicle={vehicle} />
      </Dialog>
    </Screen>
  );
}
