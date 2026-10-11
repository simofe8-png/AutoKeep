import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  useAppData,
  type BackupExportOutcome,
  type BackupRestoreOutcome,
} from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { formatDate } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  Dialog,
  Icon,
  InlineNotice,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
} from '@/ui';

type Notice = { tone: 'success' | 'warning' | 'danger'; text: string };

function exportNotice(r: BackupExportOutcome): Notice | null {
  const b = he.backup;
  if (r.ok) {
    return r.missingFiles > 0
      ? { tone: 'warning', text: b.savedMissing(r.missingFiles) }
      : { tone: 'success', text: b.saved };
  }
  if (r.reason === 'cancelled') return null;
  return { tone: 'danger', text: r.reason === 'unavailable' ? b.unavailable : b.saveFailed };
}

function restoreNotice(r: BackupRestoreOutcome): Notice | null {
  const b = he.backup;
  if (r.ok) {
    return r.missingFiles > 0
      ? { tone: 'warning', text: b.restoredMissing(r.missingFiles) }
      : { tone: 'success', text: b.restored };
  }
  if (r.reason === 'cancelled') return null;
  return { tone: 'danger', text: b.restoreErrors[r.reason] };
}

/**
 * Backup and restore (local-first, ADR-0023). All data lives only on this device; the user saves a
 * backup file where they choose (a folder on the device, Google Drive or any app via the share
 * sheet) and restores from such a file. AutoKeep has no account and keeps no copy of the data.
 */
export default function BackupScreen() {
  const router = useRouter();
  // From the first-run welcome: a restored backup leads straight to Home.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { backup, exportBackup, restoreBackup } = useAppData();
  const [busy, setBusy] = useState<'folder' | 'share' | 'restore' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const b = he.backup;

  const save = async (via: 'folder' | 'share') => {
    setBusy(via);
    setNotice(null);
    setNotice(exportNotice(await exportBackup(via)));
    setBusy(null);
  };

  const restore = async () => {
    setConfirmRestore(false);
    setBusy('restore');
    setNotice(null);
    const r = await restoreBackup();
    setBusy(null);
    if (r.ok && from === 'welcome') return router.replace('/');
    setNotice(restoreNotice(r));
  };

  return (
    <Screen testID="screen-backup" header={<ScreenHeader title={b.title} />}>
      <Card tone="highlight">
        <Row gap={spacing.md}>
          <Icon name="cellphone-lock" size={32} color="primary" />
          <AppText style={{ flex: 1 }}>{b.why}</AppText>
        </Row>
      </Card>

      {!backup.available ? (
        <InlineNotice testID="backup-unavailable" tone="info" message={b.unavailable} />
      ) : (
        <>
          <Card testID="backup-status">
            <SectionHeader title={b.statusTitle} />
            {backup.lastBackupAt ? (
              <Badge
                testID="backup-last"
                label={`${b.lastBackup}: ${formatDate(backup.lastBackupAt)}`}
                tone="success"
                icon="check"
              />
            ) : (
              <Badge testID="backup-never" label={b.never} tone="warning" icon="cellphone" />
            )}
          </Card>

          <Card>
            <SectionHeader title={b.saveTitle} />
            <AppText color="textSecondary">{b.saveBody}</AppText>
            <Stack gap={spacing.sm}>
              <Button
                testID="backup-share"
                label={b.saveShare}
                icon="share-variant-outline"
                fullWidth
                loading={busy === 'share'}
                disabled={busy !== null}
                onPress={() => void save('share')}
              />
              <Button
                testID="backup-folder"
                label={b.saveFolder}
                icon="folder-download-outline"
                variant="tonal"
                fullWidth
                loading={busy === 'folder'}
                disabled={busy !== null}
                onPress={() => void save('folder')}
              />
            </Stack>
          </Card>

          <Card>
            <SectionHeader title={b.restoreTitle} />
            <AppText color="textSecondary">{b.restoreBody}</AppText>
            <Button
              testID="backup-restore"
              label={b.restoreAction}
              icon="backup-restore"
              variant="secondary"
              fullWidth
              loading={busy === 'restore'}
              disabled={busy !== null}
              onPress={() => setConfirmRestore(true)}
            />
          </Card>
        </>
      )}

      {notice ? (
        <InlineNotice testID="backup-notice" tone={notice.tone} message={notice.text} />
      ) : null}

      <Dialog
        visible={confirmRestore}
        testID="backup-restore-confirm"
        title={b.restoreConfirmTitle}
        message={b.restoreConfirmBody}
        confirmLabel={b.restoreConfirmAction}
        cancelLabel={he.common.cancel}
        destructive
        onConfirm={() => void restore()}
        onCancel={() => setConfirmRestore(false)}
      />
    </Screen>
  );
}
