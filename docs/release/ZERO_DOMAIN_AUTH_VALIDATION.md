# Zero-domain auth validation (P2C pre-gate), 2026-09-27

**Status: research done; configuration and the test harness are prepared. VALIDATION IS WAITING
for the dedicated Gmail credential, which only the owner can create.** Nothing has been pushed to
staging yet. P2C has not started.

## Official requirements found (all sources accessed 2026-09-27)

| Topic                | Requirement                                                                                                                                                                                                                                                                                                               | Source                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Gmail SMTP           | `smtp.gmail.com`, TLS, port 465 (SSL) or 587 (STARTTLS)                                                                                                                                                                                                                                                                   | https://developers.google.com/workspace/gmail/imap/imap-smtp                                       |
| Authentication       | Password-only ("less secure apps") access ended **March 14, 2025**, **except App Passwords**: "You will no longer use a password for access (with the exception of app passwords)". OAuth is not required                                                                                                                 | https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth        |
| App Password         | "App passwords can only be used with accounts that have 2-Step Verification turned on." Not available with security-key-only 2-Step Verification, organization accounts, or Advanced Protection. Revoked when the account password changes. Google: "App passwords aren't recommended and are unnecessary in most cases." | https://support.google.com/mail/answer/185833                                                      |
| Consumer limits      | At most **500 e-mails/day** and 500 recipients per e-mail. When exceeded, sending resumes "within 1 to 24 hours"                                                                                                                                                                                                          | https://support.google.com/mail/answer/22839                                                       |
| Sender               | The From address must be the account or a verified alias; use exactly the authenticated @gmail.com address                                                                                                                                                                                                                | https://support.google.com/mail/answer/22370                                                       |
| Policy               | "Don't use Gmail to distribute spam or unsolicited commercial mail." There is no explicit ban on an app sending requested sign-in codes (and no explicit permission)                                                                                                                                                      | https://support.google.com/mail/answer/16734397, https://policies.google.com/terms                 |
| Sender requirements  | TLS; spam rate < 0.3%. DMARC alignment and unsubscribe apply only above 5,000/day                                                                                                                                                                                                                                         | https://support.google.com/mail/answer/81126                                                       |
| Supabase custom SMTP | "works with any email sending service that supports the SMTP protocol". Fields: host, port, user, pass, sender e-mail, sender name. The rate limit starts at **30 e-mails/hour** (adjustable); one OTP request per address per 60 s                                                                                       | https://supabase.com/docs/guides/auth/auth-smtp, https://supabase.com/docs/guides/auth/rate-limits |
| Templates on Free    | "Free-tier projects that configure their own SMTP provider can continue to customize templates freely." (With the default sender they cannot, as measured in P2B)                                                                                                                                                         | https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier          |

**Custom domain required?** **No.**
**Payment required?** **No.**
**Verdict from the documentation:** _suitable with constraints_ for a small invited beta. It is
not a production path: there is no SLA, deliverability rests on gmail.com's reputation, and
App Passwords are discouraged but supported.

## Prepared (no secret anywhere in the repository)

- `supabase/config.toml` `[remotes.staging.auth.email.smtp]`:
  - `smtp.gmail.com:587`;
  - user, password and sender taken from `env(AUTOKEEP_SMTP_USER)` / `env(AUTOKEEP_SMTP_PASS)` at push time;
  - sender name "AutoKeep";
  - `email_sent = 30/h`.

  Pushing it also applies the code templates (magic link + confirmation), which custom SMTP unlocks.

- `src/cloud/__tests__/otpDelivery.staging.cloud.test.ts`: real delivery to **two arbitrary
  external inboxes** (disposable mail.tm addresses, not members of the Supabase organization). It
  checks:
  - a 6-digit code;
  - wrong code fails;
  - the correct code signs in once;
  - reuse fails;
  - refresh;
  - device-local sign-out;
  - resend blocked inside 60 s, then a new code works and the old one does not;
  - expiry after 900 s (a separate 17-minute run).

## What the owner must do (the only step that cannot be automated)

1. Create a **dedicated** Google account for AutoKeep sending. It must not be a personal account.
2. Turn on **2-Step Verification** (not security-key-only, no Advanced Protection).
3. Create an **App Password**.
4. Put both values **only** in `%USERPROFILE%\.autokeep\staging.env`. Never in chat, the repo or
   the app:

   ```
   AUTOKEEP_SMTP_USER=<the dedicated address>@gmail.com
   AUTOKEEP_SMTP_PASS=<the 16-character App Password, without spaces>
   ```

Then validation continues, fully automated:

- push the SMTP configuration to staging;
- run the delivery suite, then the expiry check;
- a real-device sign-in on the Galaxy A54;
- device sync, offline → reconnect, document upload/download with integrity checks, and account
  deletion with storage cleanup;
- cleanup of the test accounts and inboxes;
- a secret scan (no SMTP credential in git, the APK or logs).
