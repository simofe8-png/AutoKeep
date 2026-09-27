import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { invitationToken } from '@/cloud/auth';
import { authErrorText } from '@/features/account/authText';
import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { AppText, Button, InlineNotice, Screen, Stack, TextField } from '@/ui';

/**
 * Private Beta registration by invitation (deep link `autokeep://invite?t=<token>`, or the link
 * pasted here). The tester chooses a username and a password; AutoKeep adds no password rules
 * (Supabase Auth's own minimum is reported by the server). Nothing else is asked.
 */
export default function InviteScreen() {
  const router = useRouter();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const { account, registerAccount, isDemoData } = useAppData();
  const fromLink = typeof t === 'string' ? invitationToken(t) : null;
  const [invitation, setInvitation] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = fromLink ?? invitationToken(invitation);
  const differ = confirm !== '' && password !== confirm;
  const unavailable = !isDemoData && account.available === false;
  const ready = token !== null && username.trim() !== '' && password !== '' && password === confirm;

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const r = await registerAccount(token, username, password);
    setBusy(false);
    if (r.ok) router.replace('/account');
    else setError(authErrorText(r));
  };

  return (
    <Screen testID="screen-invite" header={<ScreenHeader title={he.account.inviteTitle} />}>
      {unavailable ? (
        <InlineNotice testID="invite-unavailable" tone="info" message={he.account.unavailable} />
      ) : account.hasAccount ? (
        <Stack>
          <InlineNotice
            testID="invite-signed-in"
            tone="info"
            message={`${he.account.connected}: ${account.username ?? ''}`}
          />
          <Button label={he.account.title} fullWidth onPress={() => router.replace('/account')} />
        </Stack>
      ) : (
        <Stack>
          <AppText>{he.account.inviteIntro}</AppText>
          {fromLink ? (
            <InlineNotice
              testID="invite-from-link"
              tone="success"
              message={he.account.inviteReceived}
            />
          ) : (
            <TextField
              testID="invite-link"
              label={he.account.inviteLink}
              hint={he.account.inviteLinkHint}
              value={invitation}
              onChangeText={setInvitation}
              plain
              required
              error={
                invitation.trim() !== '' && !token
                  ? he.account.authErrors.invitation_invalid
                  : undefined
              }
            />
          )}
          <TextField
            testID="invite-username"
            label={he.account.username}
            hint={he.account.usernameHint}
            value={username}
            onChangeText={setUsername}
            plain
            autoComplete="username-new"
            required
          />
          <TextField
            testID="invite-password"
            label={he.account.password}
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="new-password"
            required
          />
          <TextField
            testID="invite-password-confirm"
            label={he.account.passwordConfirm}
            value={confirm}
            onChangeText={setConfirm}
            secure
            autoComplete="new-password"
            required
            error={differ ? he.account.passwordsDiffer : undefined}
          />
          {error ? <InlineNotice testID="invite-error" tone="danger" message={error} /> : null}
          <Button
            testID="invite-submit"
            label={he.account.register}
            icon="account-plus-outline"
            fullWidth
            disabled={!ready || busy}
            loading={busy}
            onPress={() => void submit()}
          />
        </Stack>
      )}
    </Screen>
  );
}
