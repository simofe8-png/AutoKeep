# Private Beta authentication: Invitation → Username + Password (2026-09-28)

**Status:** implemented and verified on local and hosted **staging** with disposable test data.
**Owner decision (2026-09-28):** this is the only Private Beta sign-in path. It supersedes the
e-mail-code (6-digit OTP) flow and the Gmail SMTP plan (`ZERO_DOMAIN_AUTH_VALIDATION.md`, now
historical). No e-mail, SMTP, SMS, phone, OTP, magic link or domain is involved.

```
administrator: invite create  ──link──▶  tester opens autokeep://invite?t=<token>
                                           │  (or pastes the link in the app)
                                           ▼
                            chooses Username + Password (+ confirmation)
                                           │  POST /functions/v1/register
                                           ▼
          claim invitation → create Auth identity → consume invitation (atomic)
                                           ▼
                        signs in with Username + Password (Supabase Auth)
```

## 1. Invitations

| Property     | How                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Random       | 32 bytes from Node `crypto.randomBytes` (256 bits), base64url                                                                                                |
| Stored       | Only `sha256(token)` in `public.beta_invitations`; the token exists only in the link, printed once                                                           |
| Single-use   | `consumed_at` set in the same flow that creates the identity; a used invitation answers `invitation_used`                                                    |
| Time-limited | `expires_at` (default 7 days, 1–90 allowed by the tool)                                                                                                      |
| Revocable    | `invite revoke <id>`, only while unused                                                                                                                      |
| Concurrency  | `claim_invitation` locks the row (`FOR UPDATE`) and hands out one claim at a time (2-minute lease). Completion re-checks the claim and revocation            |
| No leftovers | If completion fails, the new identity is deleted again and the claim released. Failed attempts (taken username, short password) never consume the invitation |
| Scope        | Authorizes creating **one** account. Grants no data access and no privileged access; clients cannot read the table or call the functions (service role only) |
| On deletion  | The consumed invitation row is deleted with the account (`on delete cascade`), so no username stays behind                                                   |

**Link format:** `autokeep://invite?t=<43 url-safe characters>`. The app accepts the link, the
link inside pasted text, or the bare token.

**Administrator tool:** `tools/beta-admin.mjs` (operator only; holds the service-role key from
`~/.autokeep/staging.env`; targets `local` and `staging`; deliberately no production target).

```
node tools/beta-admin.mjs --target staging invite create [--days 7] [--note "text"]
node tools/beta-admin.mjs --target staging invite list        # unused | used | expired | revoked
node tools/beta-admin.mjs --target staging invite revoke <id>
node tools/beta-admin.mjs --target staging invite delete <id> # unused only (cleanup)
node tools/beta-admin.mjs --target staging user list
node tools/beta-admin.mjs --target staging user set-password <username>   # new password on stdin
```

## 2. Username + Password on Supabase Auth

Supabase Auth has no username sign-in. The minimum server boundary used here:

- **Internal identifier:** `u<first 40 hex of sha256("autokeep-beta-username:v1:" + normalized)>@users.autokeep.invalid`.
  `.invalid` is a reserved top-level domain that can never receive mail (RFC 2606). The tester
  never provides, sees or depends on it.
- **Sign-in** is Supabase's own `signInWithPassword` with that derived address. There is no
  username lookup endpoint, so usernames cannot be enumerated: a wrong username and a wrong
  password both return "invalid login credentials".
- **Uniqueness** comes from Supabase Auth's unique e-mail constraint on the derived address, so it
  is atomic.
- **Username storage:** the display form is kept in `app_metadata.username` (server-set, not
  user-editable) and in the consumed invitation row.
- **Registration** is the `register` Edge Function (`verify_jwt = false`; the invitation is the
  authorization). It creates the identity through the Auth admin API with the tester's password.
  The password passes through the function over TLS, only to Supabase Auth. It is never stored,
  logged or returned.
- **Public sign-up is off** (`[auth] enable_signup = false`). `[auth.email] enable_signup` must
  stay true, because in Supabase that flag switches the whole e-mail provider, including password
  sign-in. Verified: `signUp()` is refused.
- **No custom password crypto:** Supabase Auth hashes (bcrypt) and verifies every password.

**Normalization (the only rules):**

- outer whitespace trimmed;
- case-insensitive (`toLowerCase`);
- 1–32 characters;
- invisible characters (control, zero-width, bidi overrides) refused, because two usernames that
  look the same could otherwise differ.

The definition is shared by the app and the function (`supabase/functions/_shared/username.ts`),
and a unit test pins a digest produced by Deno Web Crypto against the app's derivation.

## 3. Passwords: no AutoKeep policy

AutoKeep has no length, character-class, strength, warning or generation rules. The only limits
are **Supabase Auth technical constraints** (source `supabase/auth`,
`internal/conf/configuration.go` and `internal/api/password.go`, read 2026-09-28):

| Constraint             | Value                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Minimum length         | **6**. `minimum_password_length` below 6 is raised to 6 by the server (`defaultMinPasswordLength = 6`)                 |
| Maximum length         | **72 bytes** (bcrypt): 72 Latin characters, 36 Hebrew characters. Error "Password cannot be longer than 72 characters" |
| Character requirements | none (`password_requirements = ""`)                                                                                    |

Configured: `minimum_password_length = 6` (the lowest supported value), `password_requirements = ""`.
The app shows these limits only when the server refuses a password, and names them as provider
limits ("…מגבלה טכנית של הספק, לא של AutoKeep"). Six identical characters are accepted (tested).

## 4. Password change and reset

- **Change (tester):** Account → "שינוי סיסמה": new password plus confirmation, then
  `auth.updateUser({ password })`. There is no e-mail step (`secure_password_change = false`,
  which must stay false: reauthentication would send an e-mail nonce). The same password is
  refused ("same_password").
- **Forgotten password:** administrator-assisted. `user set-password <username>` reads the new
  password from stdin and SETS it (`auth.admin.updateUserById`). No existing password is ever
  readable (bcrypt hashes only; tested that the admin API output does not contain it). There is
  no e-mail recovery, no OTP recovery and no security questions.

## 5. Disposition of the e-mail-code (OTP) flow

**Removed:**

- `requestEmailCode` / `verifyEmailCode` and the address/code UI;
- `supabase/templates/magic_link.html` and the two template sections;
- the staging SMTP block (`[remotes.staging.auth.email.smtp]`) and its `email_sent` rate override;
- `otpDelivery.staging.cloud.test.ts` (Gmail validation) and `auth.staging.cloud.test.ts` (OTP on
  hosted).

**Kept, unused:** Supabase's e-mail provider itself (password sign-in needs it). A code or
reset e-mail to a `.invalid` address can never be delivered. On staging, `otp_expiry` (900 s)
and `max_frequency` (60 s) are kept at the stricter values rather than loosened. Changing the
e-mail address requires confirmation from the old address (`double_confirm_changes`), which
cannot receive mail, so the internal address cannot be replaced.

**Gmail / App Password / SMTP is no longer an outstanding item.**

## 6. What stays exactly as before (P2A/P2B)

These are all unchanged and re-verified by the same suites:

- a unique Auth identity per tester;
- RLS and cross-user isolation;
- private storage;
- server-side authorization;
- sessions, refresh and device-local sign-out;
- user-scoped sync and backup;
- account deletion with storage cleanup;
- HTTPS-only release guard;
- no privileged key in the APK.

## 7. Verification

| Where                                               | Result                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run verify`                                    | **50 suites / 365 tests** (auth unit tests 18, account UI 14)                                                                                    |
| Local cloud suite                                   | **52/52**, including `privateBeta.cloud.test.ts` 10/10                                                                                           |
| **Hosted staging** (`AUTOKEEP_TEST_TARGET=staging`) | **52/52**: invitations, registration, sign-in, password change/reset, deletion, plus RLS/storage 14, hardening 12, account 4, deletion 2, sync 6 |

`privateBeta.cloud.test.ts` drives the real administrator CLI and covers:

- **Invitations:**
  - a valid invitation registers exactly one account, consumed atomically with it;
  - reuse is refused;
  - expired, revoked and random tokens are refused and create nothing;
  - 5 concurrent registrations with one invitation create exactly 1 account;
  - clients cannot read or claim invitations, and `signUp` is refused.
- **Registration:**
  - a duplicate username (any case, outer spaces) is refused and the invitation is kept;
  - 5 characters is refused and the invitation is kept;
  - 73 characters is refused;
  - `111111` is accepted.
- **Login:**
  - Username + Password, with the username in any case;
  - wrong username and wrong password give the same answer;
  - refresh works;
  - device-local sign-out leaves the other device signed in.
- **Account:**
  - the user changes the password with no e-mail step;
  - the administrator sets a password and the old one stops working;
  - after deletion the identity and the invitation/username are gone and the username can be
    registered again.

## 8. Galaxy A54 (hosted staging)

**Result: PASS (2026-09-28).** Release-mode staging APK from the local zero-cost build:

- package `com.autokeep.app.staging`, 49 MB, sha256 `d1212ac6…6ab7ef`;
- HTTPS staging backend;
- bundle scan: the anon key and the HTTPS URL are present; the service-role key, DB password,
  DB URL, pooler and loopback are absent.

Test data only ("A54 Tester", synthetic vehicle A54TEST, plate 99-900-54, a 242-byte synthetic PDF).

| #   | Check (on the phone, against hosted staging)                                                                                                                                                                                                                                          | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Administrator creates an invitation (`tools/beta-admin.mjs --target staging`); `autokeep://invite?t=…` opens the registration screen with "invitation received"; only Username, Password and Confirm are asked                                                                        | PASS   |
| 2   | Password `12345`: refused by Supabase, shown as a provider limit ("…מגבלה טכנית של הספק, לא של AutoKeep"); the invitation is not consumed                                                                                                                                             | PASS   |
| 3   | Password `123456`: account created and signed in as "A54 Tester". Server: invitation consumed by that identity; internal `u…@users.autokeep.invalid` address; username in `app_metadata`                                                                                              | PASS   |
| 4   | Session persists across a force-stop and relaunch                                                                                                                                                                                                                                     | PASS   |
| 5   | Local-first vehicle and odometer sync to hosted staging (rows under the tester's `owner_id`)                                                                                                                                                                                          | PASS   |
| 6   | Offline (Wi-Fi and data off): the odometer update stays local and "one change waiting" is shown; after reconnecting it is backed up automatically                                                                                                                                     | PASS   |
| 7   | Document upload to the private bucket `<user>/<vehicle>/<document>`: 242 B, sha256 identical to the original (server copy downloaded and hashed)                                                                                                                                      | PASS   |
| 8   | Device-local sign-out keeps the data. Sign-in with `a54 tester` (any case) + wrong password → "username or password incorrect"; correct password → signed in                                                                                                                          | PASS   |
| 9   | In-app password change to `aaaaaa` (no rules, no e-mail); server: the old one refused, the new one accepted                                                                                                                                                                           | PASS   |
| 10  | Administrator reset (`user set-password`); server: the user's password refused, the admin-set one accepted                                                                                                                                                                            | PASS   |
| 11  | "New device": app data cleared, then sign-in with the admin-set password restores the vehicle and the document; the original is downloaded and verified ("identical to the saved file"). Samsung Pass offered to save the credentials (declined), which shows the autofill hints work | PASS   |
| 12  | Permanent vehicle deletion: vehicle, document and odometer rows and the stored original removed on the server; tombstone recorded                                                                                                                                                     | PASS   |
| 13  | Account deletion from the phone (typed username): Auth identity, invitation/username, all rows and objects gone; the phone wiped back to the welcome screen                                                                                                                           | PASS   |

**Found (not blockers, pre-existing, outside auth):**

- **UTC dates around midnight.** "Last backed up" and a document's "added" date show the UTC day:
  27.9 for actions at 00:25–00:33 local time on 28.9. Same class as the RC "today" fix, but in
  display formatting of timestamps.
- **Delete-vehicle confirmation.** It accepts the dashed plate "99-900-54" only, not "9990054";
  the placeholder shows the dashed form.

**Play Protect:** installing asked to upload the unknown app for scanning; declined, as in P2B.

## 9. Remaining before the first real Beta invitation (none is an auth blocker)

1. **A Private Beta backend project** (P2C, approval gate): Pro vs Free is decided there.
   - Apply the migrations, including `20260928000001`.
   - Deploy `register` and `delete-account`.
   - Push the auth config: sign-up off, password floor 6, no requirements.
   - Add a `beta` target to `tools/beta-admin.mjs` only then.
2. **Invitation link delivery.** `autokeep://` links are not tappable in some messengers. The
   tester can always paste the link in the app ("קיבלתי הזמנה — הרשמה"), which works and is
   tested. A tappable HTTPS link would need a web page or domain, so it is out of scope for now.
3. **Operator key custody.** The service-role key stays on the administrator's computer only.
   Forgotten passwords are reset by the administrator (no self-service recovery).
4. The rest of the P2C MUST list, unchanged:
   - privacy notice;
   - a stable signed build and a distribution channel;
   - backup/restore drill;
   - incident runbook;
   - onboarding text.
5. Minor pre-existing UI findings from the A54 run (§8).
