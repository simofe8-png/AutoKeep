import { useRouter } from 'expo-router';
import { useState } from 'react';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { draftToEvent, hasErrors, validateDraft } from '@/features/service/draft';
import { FromAlertBanner, NoDraft, ServiceForm } from '@/features/service/ServiceForm';
import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  Dialog,
  DocumentThumb,
  InlineNotice,
  Row,
  Screen,
  spacing,
} from '@/ui';

/**
 * Review & explicit confirmation (T021). Document-derived drafts never auto-commit: the user
 * reviews, corrects, and confirms in a dialog that names the target vehicle.
 */
export default function ReviewServiceScreen() {
  const router = useRouter();
  const { draft, update, setDraft } = useServiceDraft();
  const { vehicles } = useActiveVehicle();
  const { addServiceEvent, today } = useAppData();
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const vehicle = vehicles.find((v) => v.id === draft?.vehicleId);

  if (!draft || !vehicle) return <NoDraft />;
  const errors = validateDraft(draft, today());

  return (
    <Screen
      testID="screen-service-review"
      header={<ScreenHeader title={he.service.reviewTitle} brand />}
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
      {draft.fromAlertItem !== undefined ? (
        <FromAlertBanner title={draft.fromAlertItem || undefined} />
      ) : null}
      <AppText color="textSecondary">{he.service.reviewBody}</AppText>
      {draft.origin === 'document' ? (
        <>
          {draft.readingNote === 'unavailable' || draft.readingNote === 'failed' ? (
            <InlineNotice
              testID="review-reading-note"
              tone="info"
              title={
                draft.readingNote === 'unavailable' ? he.service.readingUnavailableTitle : undefined
              }
              message={
                draft.readingNote === 'unavailable'
                  ? he.service.readingUnavailable
                  : he.service.readingFailed
              }
            />
          ) : (
            <InlineNotice
              tone="warning"
              title={he.service.draftFromDocument}
              message={
                draft.readingNote === 'flagged' ? he.service.readingFlagged : he.service.photoHint
              }
            />
          )}
          {draft.documentTitle ? (
            <Card testID="review-original-document">
              <Row gap={spacing.md}>
                <DocumentThumb
                  mimeType={draft.attachment?.file.mimeType}
                  icon="receipt"
                  size={52}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="small" color="textMuted">
                    {he.service.originalDocument}
                  </AppText>
                  <AppText variant="smallStrong" numberOfLines={2}>
                    {draft.documentTitle}
                  </AppText>
                </View>
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
          addServiceEvent(draftToEvent(draft, newLocalId('svc')), draft.attachment);
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
