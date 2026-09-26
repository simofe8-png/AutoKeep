import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData, type AccountResult } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { formatDate } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  Icon,
  InlineNotice,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  TextField,
} from '@/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const errorText: Record<Exclude<AccountResult, { ok: true }>['reason'], string> = {
  invalid_email: he.account.invalidEmail,
  invalid_code: he.account.invalidCode,
  network: he.account.networkError,
  rate_limited: he.account.rateLimited,
  unknown: he.states.genericErrorTitle,
};

/**
 * Account & backup (T026/T138/T140). Framed around saving/backing up data; registration never
 * blocks use. Real mode: passwordless email code (proven provider), then this device's data is
 * adopted into the account and synced. Without a configured cloud, the screen says so.
 */
export default function AccountScreen() {
  const router = useRouter();
  const {
    account,
    setAccount,
    network,
    isDemoData,
    requestAccountCode,
    verifyAccountCode,
    syncNow,
    signOutAccount,
    acknowledgeConflicts,
  } = useAppData();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL.test(email.trim());
  const unavailable = !isDemoData && account.available === false;

  const run = async (op: () => Promise<AccountResult>, next?: () => void) => {
    setBusy(true);
    setError(null);
    const r = await op();
    setBusy(false);
    if (r.ok) next?.();
    else setError(errorText[r.reason]);
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
      </Card>

      {network === 'offline' ? (
        <InlineNotice tone="neutral" message={he.states.offlineMessage} />
      ) : null}

      {unavailable ? (
        <InlineNotice testID="account-unavailable" tone="info" message={he.account.unavailable} />
      ) : !account.hasAccount ? (
        <Stack>
          <TextField
            testID="account-email"
            label={he.account.email}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setTouched(true);
            }}
            keyboardType="email-address"
            required
            error={touched && email !== '' && !valid ? he.account.invalidEmail : undefined}
          />
          {isDemoData ? <InlineNotice tone="info" message={he.account.authPending} /> : null}
          {step === 'code' ? (
            <TextField
              testID="account-code"
              label={he.account.code}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={10}
              required
            />
          ) : null}
          {step === 'code' ? (
            <InlineNotice testID="account-code-sent" tone="info" message={he.account.codeSent} />
          ) : null}
          {error ? <InlineNotice testID="account-error" tone="danger" message={error} /> : null}
          {isDemoData ? (
            <Button
              testID="account-create"
              label={he.account.create}
              icon="account-plus-outline"
              fullWidth
              disabled={!valid}
              onPress={() =>
                setAccount({
                  hasAccount: true,
                  email: email.trim(),
                  lastBackupAt: new Date().toISOString().slice(0, 10),
                })
              }
            />
          ) : step === 'email' ? (
            <Button
              testID="account-create"
              label={he.account.sendCode}
              icon="email-fast-outline"
              fullWidth
              disabled={!valid || busy}
              loading={busy}
              onPress={() =>
                void run(
                  () => requestAccountCode(email),
                  () => setStep('code'),
                )
              }
            />
          ) : (
            <Button
              testID="account-verify"
              label={he.account.verify}
              icon="check"
              fullWidth
              disabled={code.trim().length < 6 || busy}
              loading={busy}
              onPress={() => void run(() => verifyAccountCode(email, code))}
            />
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
          <Card>
            <AppText variant="small" color="textMuted">
              {he.account.email}
            </AppText>
            <AppText variant="bodyStrong" testID="account-signed-in">
              {account.email}
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
              <Button
                testID="account-sign-out"
                label={he.account.signOut}
                variant="ghost"
                fullWidth
                onPress={() => void signOutAccount()}
              />
            </>
          ) : null}
        </Stack>
      )}
    </Screen>
  );
}
