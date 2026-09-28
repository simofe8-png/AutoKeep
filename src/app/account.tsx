import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { authErrorText } from '@/features/account/authText';
import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
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
  TextField,
  StatusCard,
} from '@/ui';

/**
 * Account & backup (T026/T138/T140). Framed around saving/backing up data; registration never
 * blocks use. Private Beta: Username + Password sign-in (accounts are created by invitation only,
 * on the invite screen); then this device's data is adopted into the account and synced. Without a
 * configured cloud, the screen says so. No password rules of AutoKeep's own.
 */
export default function AccountScreen() {
  const router = useRouter();
  // Existing-user entry from the first-run welcome: after signing in, the restored data leads
  // straight to Home (no vehicle has to be added first on a new device).
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromWelcome = from === 'welcome';
  const { vehicles } = useActiveVehicle();
  const {
    account,
    setAccount,
    network,
    isDemoData,
    signInAccount,
    changeAccountPassword,
    syncNow,
    signOutAccount,
    acknowledgeConflicts,
    deleteAccount,
  } = useAppData();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const confirmMatches =
    typed.trim().toLowerCase() !== '' &&
    typed.trim().toLowerCase() === (account.username ?? '').trim().toLowerCase();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [changeNotice, setChangeNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const differ = newPasswordConfirm !== '' && newPassword !== newPasswordConfirm;
  const unavailable = !isDemoData && account.available === false;

  const restored = fromWelcome && account.hasAccount && vehicles.length > 0;
  useEffect(() => {
    if (restored) router.replace('/');
  }, [restored, router]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const r = await signInAccount(username, password);
    setBusy(false);
    if (r.ok) setPassword('');
    else setError(authErrorText(r));
  };

  const savePassword = async () => {
    setBusy(true);
    setChangeNotice(null);
    const r = await changeAccountPassword(newPassword);
    setBusy(false);
    if (r.ok) {
      setChanging(false);
      setNewPassword('');
      setNewPasswordConfirm('');
      setChangeNotice({ ok: true, text: he.account.passwordChanged });
    } else setChangeNotice({ ok: false, text: authErrorText(r) });
  };

  return (
    <Screen testID="screen-account" header={<ScreenHeader title={he.account.title} />}>
      <Card tone="highlight">
        <Row gap={spacing.md}>
          <Icon name="shield-check-outline" size={32} color="primary" />
          <AppText style={{ flex: 1 }}>{he.account.why}</AppText>
        </Row>
      </Card>

      <Card testID="backup-status">
        <SectionHeader title={he.account.backupStatus} />
        {account.hasAccount && account.adoption !== 'none' && account.adoption !== undefined ? (
          <Stack gap={spacing.xs}>
            <Badge
              label={account.adoption === 'adopted' ? he.account.connected : he.account.adopting}
              tone={account.adoption === 'adopted' ? 'success' : 'warning'}
              icon={account.adoption === 'adopted' ? 'check' : 'progress-upload'}
            />
            {account.lastBackupAt ? (
              <AppText color="textSecondary">
                {he.account.backedUp}: {formatDate(account.lastBackupAt)}
              </AppText>
            ) : null}
            {account.pending ? (
              <AppText testID="backup-pending" color="textSecondary">
                {he.account.pending(account.pending)}
              </AppText>
            ) : null}
          </Stack>
        ) : account.hasAccount && isDemoData && account.lastBackupAt ? (
          <Stack gap={spacing.xs}>
            <Badge label={he.account.connected} tone="success" icon="check" />
            <AppText color="textSecondary">
              {he.account.backedUp}: {formatDate(account.lastBackupAt)}
            </AppText>
          </Stack>
        ) : (
          <Badge label={he.account.notBackedUp} tone="warning" icon="cellphone" />
        )}
        {account.conflicts ? (
          <InlineNotice
            testID="backup-conflicts"
            tone="info"
            message={he.account.conflicts(account.conflicts)}
            action={{ label: he.account.acknowledge, onPress: acknowledgeConflicts }}
          />
        ) : null}
        {account.syncError ? (
          <InlineNotice
            testID="backup-error"
            tone="warning"
            message={he.account.syncErrors[account.syncError]}
          />
        ) : null}
        {account.notBackedUp ? (
          <InlineNotice
            testID="backup-not-backed-up"
            tone="warning"
            message={he.account.refusedChanges(account.notBackedUp)}
          />
        ) : null}
      </Card>

      {network === 'offline' ? (
        <InlineNotice tone="neutral" message={he.states.offlineMessage} />
      ) : null}

      {unavailable ? (
        <InlineNotice testID="account-unavailable" tone="info" message={he.account.unavailable} />
      ) : !account.hasAccount ? (
        <Stack>
          {!isDemoData ? <InlineNotice tone="info" message={he.account.inviteOnly} /> : null}
          <TextField
            testID="account-username"
            label={he.account.username}
            value={username}
            onChangeText={setUsername}
            plain
            autoComplete="username"
            required
          />
          <TextField
            testID="account-password"
            label={he.account.password}
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="current-password"
            required
          />
          {isDemoData ? <InlineNotice tone="info" message={he.account.authPending} /> : null}
          {error ? <InlineNotice testID="account-error" tone="danger" message={error} /> : null}
          {isDemoData ? (
            <Button
              testID="account-sign-in"
              label={he.account.create}
              icon="account-plus-outline"
              fullWidth
              disabled={username.trim() === ''}
              onPress={() =>
                setAccount({
                  hasAccount: true,
                  username: username.trim(),
                  lastBackupAt: new Date().toISOString().slice(0, 10),
                })
              }
            />
          ) : (
            <>
              <Button
                testID="account-sign-in"
                label={he.account.signIn}
                icon="login"
                fullWidth
                disabled={username.trim() === '' || password === '' || busy}
                loading={busy}
                onPress={() => void signIn()}
              />
              <Button
                testID="account-have-invitation"
                label={he.account.haveInvitation}
                icon="email-open-outline"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/invite')}
              />
              <AppText variant="small" color="textSecondary">
                {he.account.forgotPassword}
              </AppText>
            </>
          )}
          <Button
            testID="account-later"
            label={he.account.later}
            variant="ghost"
            fullWidth
            onPress={() => router.back()}
          />
        </Stack>
      ) : (
        <Stack>
          {fromWelcome ? (
            <StatusCard
              testID="account-restoring"
              tone="success"
              icon="check"
              title={he.account.signedInTitle}
              subtitle={he.account.restoringBody}
            >
              <Button
                testID="account-continue"
                label={he.account.continueToApp}
                fullWidth
                onPress={() => router.replace('/')}
              />
            </StatusCard>
          ) : null}
          <Card>
            <AppText variant="small" color="textMuted">
              {he.account.username}
            </AppText>
            <AppText variant="bodyStrong" testID="account-signed-in">
              {account.username}
            </AppText>
          </Card>
          {!isDemoData ? (
            <>
              <Button
                testID="account-sync-now"
                label={he.account.syncNow}
                icon="cloud-sync-outline"
                variant="secondary"
                fullWidth
                onPress={syncNow}
              />
              {changing ? (
                <Card testID="account-change-password">
                  <Stack>
                    <TextField
                      testID="account-new-password"
                      label={he.account.newPassword}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secure
                      autoComplete="new-password"
                      required
                    />
                    <TextField
                      testID="account-new-password-confirm"
                      label={he.account.passwordConfirm}
                      value={newPasswordConfirm}
                      onChangeText={setNewPasswordConfirm}
                      secure
                      autoComplete="new-password"
                      required
                      error={differ ? he.account.passwordsDiffer : undefined}
                    />
                    <Button
                      testID="account-save-password"
                      label={he.account.changePasswordAction}
                      icon="lock-reset"
                      fullWidth
                      disabled={newPassword === '' || newPassword !== newPasswordConfirm || busy}
                      loading={busy}
                      onPress={() => void savePassword()}
                    />
                  </Stack>
                </Card>
              ) : (
                <Button
                  testID="account-change-password-open"
                  label={he.account.changePassword}
                  icon="lock-outline"
                  variant="secondary"
                  fullWidth
                  disabled={network === 'offline'}
                  onPress={() => {
                    setChangeNotice(null);
                    setChanging(true);
                  }}
                />
              )}
              {changeNotice ? (
                <InlineNotice
                  testID="account-password-notice"
                  tone={changeNotice.ok ? 'success' : 'danger'}
                  message={changeNotice.text}
                />
              ) : null}
              <Button
                testID="account-sign-out"
                label={he.account.signOut}
                variant="ghost"
                fullWidth
                onPress={() => void signOutAccount()}
              />
              <Card compact tone="danger">
                <Stack gap={spacing.xs}>
                  <Button
                    testID="account-delete"
                    label={he.account.deleteAccount}
                    icon="delete-forever-outline"
                    variant="ghost"
                    fullWidth
                    disabled={network === 'offline' || deleting}
                    onPress={() => {
                      setTyped('');
                      setDeleteError(null);
                      setDeleteOpen(true);
                    }}
                  />
                  <AppText variant="small" color="textSecondary">
                    {network === 'offline'
                      ? he.account.deleteAccountOffline
                      : he.account.deleteAccountHint}
                  </AppText>
                </Stack>
              </Card>
              {deleteError ? (
                <InlineNotice testID="account-delete-error" tone="danger" message={deleteError} />
              ) : null}
            </>
          ) : null}
        </Stack>
      )}

      <Dialog
        visible={deleteOpen}
        testID="account-delete-dialog"
        destructive
        title={he.account.deleteAccount}
        message={he.account.deleteAccountBody}
        confirmLabel={he.account.deleteAccountAction}
        confirmDisabled={!confirmMatches || deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!confirmMatches || deleting) return;
          setDeleting(true);
          void deleteAccount().then((r) => {
            setDeleting(false);
            setDeleteOpen(false);
            if (r.ok) router.replace('/');
            else setDeleteError(he.account.deleteAccountFailed[r.reason]);
          });
        }}
      >
        <TextField
          testID="account-delete-confirm-input"
          label={he.account.deleteAccountConfirm}
          value={typed}
          onChangeText={setTyped}
          plain
          placeholder={account.username}
          required
        />
      </Dialog>
    </Screen>
  );
}
