import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
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

/**
 * Account & backup (T026). Framed around saving/backing up data. Real authentication is a
 * proven provider (Supabase Auth, M07/M08); the prototype sends nothing anywhere.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { account, setAccount, network } = useAppData();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = EMAIL.test(email.trim());

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
        {account.hasAccount && account.lastBackupAt ? (
          <Stack gap={spacing.xs}>
            <Badge label={he.account.connected} tone="success" icon="check" />
            <AppText color="textSecondary">
              {he.account.backedUp}: {formatDate(account.lastBackupAt)}
            </AppText>
          </Stack>
        ) : (
          <Badge label={he.account.notBackedUp} tone="warning" icon="cellphone" />
        )}
      </Card>

      {network === 'offline' ? (
        <InlineNotice tone="neutral" message={he.states.offlineMessage} />
      ) : null}

      {!account.hasAccount ? (
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
          <InlineNotice tone="info" message={he.account.authPending} />
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
          <Button
            testID="account-later"
            label={he.account.later}
            variant="ghost"
            fullWidth
            onPress={() => router.back()}
          />
        </Stack>
      ) : (
        <Card>
          <AppText variant="small" color="textMuted">
            {he.account.email}
          </AppText>
          <AppText variant="bodyStrong">{account.email}</AppText>
        </Card>
      )}
    </Screen>
  );
}
