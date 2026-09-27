# P2C: Real-user Private Beta, readiness analysis (2026-09-27): PLAN ONLY

**Scope.** Nothing here is implemented or approved. P2C starts only on explicit instruction.

**Fixed constraints (user decision, 2026-09-27):**

- no custom domain;
- Supabase-provided HTTPS URLs only;
- invited real users with real vehicles, history and documents over an extended period;
- Private Beta first, commercial release much later;
- no paid AI/OCR/search.

> **Update 2026-09-28:** §1–§2 are **historical**. Authentication is now
> **Invitation → Username + Password**, with no e-mail, SMTP or domain. It is implemented and
> verified on staging (`PRIVATE_BETA_AUTH.md`). Matrix rows 1, 3 and 4 are updated below.

## 1. The authentication gap (proven in P2B)

On the hosted Free project with Supabase's built-in e-mail:

1. The built-in sender reaches only the organization's team members. For any other address,
   `signInWithOtp` is refused with `400 Email address "…" is invalid` (measured in P2B).
2. **E-mail templates cannot be changed** without custom SMTP: "Email template modification is not
   available for free tier projects using the default email provider". The default template sends
   a **link**, while the app's flow expects a **6-digit code**, so even a team member could not
   sign in through the app.
3. Everything else in the flow works on hosted: 6-digit codes, single use, verification, sessions,
   refresh, device-only sign-out (`auth.staging.cloud.test`).

⇒ **Real invited users cannot sign in until custom SMTP (or another method) is configured.** This
is a **MUST** before P2C. P2B did not work around it.

## 2. Zero-domain authentication options (for decision; none approved)

| Option                                                                                                                    | How                                                                                                              | Security                                                                                 | Privacy                                                                      | UX                        | Cost                           | Provider dependency                                                                                               | Implementation impact                                                                         | Android / Google Play                          | Future iOS                                                                                                                | Migration for beta users                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **A. Custom SMTP through a dedicated Gmail account** (e.g. an AutoKeep Gmail address, 2-step verification + app password) | Supabase Auth → SMTP: `smtp.gmail.com:587` with the app password; our code template becomes editable             | Same flow as today (e-mail code); the app password is a credential held only in Supabase | Code e-mails transit Google (as they would any recipient's mailbox provider) | **Unchanged**             | **$0**                         | One Google account (consumer sending limit ≈ 500 recipients/day, plenty for a beta; low-volume transactional use) | **Configuration only**, no code change                                                        | None                                           | None                                                                                                                      | None: the same accounts continue                                      |
| B. Custom SMTP through a free-tier provider with a single verified sender address (no domain), e.g. Brevo                 | Verify one sender mailbox, use the provider's SMTP                                                               | As A                                                                                     | Provider processes e-mails                                                   | Unchanged                 | $0 (≈300/day)                  | Provider plus mailbox                                                                                             | Config only                                                                                   | None                                           | None                                                                                                                      | None                                                                  |
| C. Google Sign-In (Android) through Supabase `signInWithIdToken`                                                          | Native Google credential → ID token → Supabase session; the callback is the Supabase HTTPS URL, no domain needed | Strong (Google account security, no codes to intercept)                                  | Google shares name and e-mail; Google learns the user uses AutoKeep          | Best on Android (one tap) | $0 (Google Cloud OAuth client) | Google                                                                                                            | **Code + native module** → needs a dev/release build; OAuth client with the signing-key SHA-1 | Fine; must be declared in the Data safety form | Apple requires **Sign in with Apple** whenever third-party login is offered (guideline 4.8), and iOS needs its own client | E-mail-code users can be linked by verified e-mail (verify behaviour) |
| D. SMS one-time codes                                                                                                     | Supabase phone auth plus Twilio or similar                                                                       | Weaker (SIM swap)                                                                        | Phone number becomes personal data                                           | OK                        | **Paid per SMS**               | SMS vendor                                                                                                        | Config + small UI                                                                             | Phone-number data declaration                  | Works                                                                                                                     | Would add a phone identity                                            |
| E. Anonymous accounts, linked later                                                                                       | Supabase anonymous sign-in                                                                                       | No recovery until linked                                                                 | Minimal                                                                      | Invisible                 | $0                             | None                                                                                                              | Code                                                                                          | Fine                                           | Fine                                                                                                                      | Must link before any device change; not suitable alone                |

**Considerations:**

- **A is the smallest safe change.** It is configuration only, keeps the verified architecture, and
  costs $0 with no domain. Deliverability risk is acceptable for an invited beta. **B** is the
  fallback if Gmail sending proves unreliable.
- **C** is a strong long-term option but a material architecture change; it needs your approval
  and native work.
- **D** is paid; **E** is not a standalone solution.

**Recommendation:** A for P2C. Consider C later.
**Approval needed:**

- creating the Google account and app password (an external account);
- storing the credential as a Supabase SMTP setting;
- enabling it on the P2C project.

## 3. Readiness matrix

### MUST have before the first real beta user

| #   | Item                                    | State after P2B                                                                                                | What is missing                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reliable zero-domain authentication     | **Done (2026-09-28):** Invitation → Username + Password, verified on hosted staging (52/52) and the Galaxy A54 | Deploy the `register` function and the invitation migration on the beta project; the operator keeps `tools/beta-admin.mjs` and the service-role key off the app                                                                                                                     |
| 2   | Backend suitable for real personal data | Staging (Free) proves the architecture                                                                         | A **separate** Private-Beta project (never mixed with staging). **Pro** recommended: daily backups (7 days) and no inactivity pause. Free has neither; see §4                                                                                                                       |
| 3   | Invite-only access                      | **Done:** public sign-up off; single-use, expiring, revocable invitations (hash-only storage)                  | —                                                                                                                                                                                                                                                                                   |
| 4   | Privacy notice + consent                | None in the app                                                                                                | Hebrew notice covering: what is stored locally and in the EU cloud, documents, the plate sent to data.gov.il, retention, deletion, contact. Shown before sign-in; the in-app link needs approval of the text                                                                        |
| 5   | Account deletion                        | **Done** (P2A; verified on hosted staging)                                                                     | Operator check that `delete-account` is deployed on the beta project                                                                                                                                                                                                                |
| 6   | Data retention / deletion policy        | Deletion paths exist                                                                                           | A written policy: backups age out after 7 days (Pro); deleted accounts leave nothing but backups; beta-end procedure                                                                                                                                                                |
| 7   | Backup / recovery                       | Pro daily backups (if chosen); originals also stay on devices                                                  | A tested restore drill on staging; a weekly offline `db dump` of the beta project, encrypted, held by the owner                                                                                                                                                                     |
| 8   | Monitoring (minimum)                    | Dashboard logs and usage exist                                                                                 | A weekly checklist: auth errors, function errors, storage growth, `storage_usage_report()`; usage-alert e-mails on                                                                                                                                                                  |
| 9   | Abuse controls                          | P2A controls (quotas, limits, insert-only storage, rate limits) verified on hosted                             | Auth rate limits reviewed for the beta; invite-only (#3) removes open abuse                                                                                                                                                                                                         |
| 10  | Incident / recovery procedure           | None                                                                                                           | A one-page runbook: revoke a session or user, restore a backup, pause the beta, notify users                                                                                                                                                                                        |
| 11  | Beta onboarding                         | None                                                                                                           | Invitation text, install steps, what to expect (not verified maintenance schedules; manual entry), how to report                                                                                                                                                                    |
| 12  | Feedback / error reporting              | None                                                                                                           | Minimum: a "send feedback" e-mail link in Settings (no new provider). Crash reporting would be a provider decision                                                                                                                                                                  |
| 13  | Distribution to invited Android users   | Local debug-signed APKs only                                                                                   | A **stable release signing key** (the EAS-managed keystore already exists; the free EAS quota resets monthly) plus a channel: **Firebase App Distribution** ($0) or **Google Play internal testing** ($25 one-time). Sideloading a debug-signed APK is not acceptable for real data |
| 14  | Safe upgrades                           | Local migrations are forward-only; versions are server-authoritative                                           | The same package id and signing key for every beta build; `versionCode` always increasing; the release notes flag schema changes; an upgrade-with-data test before each release (as in RC)                                                                                          |
| 16  | Compatibility tracking                  | P1 source matrix exists                                                                                        | A beta log per vehicle (make, model, year, market, source found or not); with the user's consent, no documents                                                                                                                                                                      |

### SHOULD have during the beta

- Google Sign-In (option C) evaluated.
- Crash reporting (provider decision).
- Lock-screen notification privacy.
- A retention job for the sync ledger and tombstones.
- A storage orphan reaper.
- Automated restore drill.
- In-app "what's new".
- Per-document delete.
- SQLCipher encryption at rest.
- Captcha if abuse appears.
- Hebrew/Arabic help pages.

### LATER (commercial release)

- Custom domain and branded sender (SPF/DKIM/DMARC).
- A paid e-mail tier.
- Google Play production listing and store policies.
- iOS: Apple Developer account ($99/year), Sign in with Apple if social login exists, App Store privacy labels, iOS build pipeline.
- SLA/support.
- PITR.
- Legal terms.
- Verified official maintenance sources with written importer permission (P1).
- Paid OCR/AI only if ever approved.

## 4. Recommended architecture for the real-user beta

- **Unchanged app architecture** (RC + P2A), with Invitation → Username + Password sign-in (no e-mail).
- **A new Supabase project `autokeep-beta`** in EU Frankfurt, on **Pro** (recommended):
  - the P2A migrations applied by `db push`;
  - the documented configuration pushed with its own `[remotes.beta]` block;
  - `delete-account` deployed.
- **Staging stays separate** (Free) for technical verification; there is never real data in staging.
- **Free is technically possible but not recommended for personal data:**
  - no backups;
  - pausing after 7 idle days, which is possible in a small beta;
  - two-active-project limit, and the organization already runs "kolbox Project" plus staging.

  A Free beta would need the owner to run manual daily dumps and accept the pause risk.

- **Builds:** EAS (free quota) with the managed keystore → Firebase App Distribution or Play
  internal testing.

## 5. Resources and costs P2C would require

| Resource                                    | Cost                                                                             | Gate             |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- |
| Supabase project `autokeep-beta` on **Pro** | **$25/month** (Micro compute covered by the credit); spend cap on                | Paid service     |
| (alternative) the same on Free              | $0, no backups, can pause; needs a free project slot (the org limit is 2 active) | Hosted resource  |
| Release signing                             | $0 (EAS-managed keystore exists)                                                 | Credentials use  |
| EAS builds                                  | $0 within the free monthly quota                                                 | —                |
| Distribution                                | Firebase App Distribution $0 **or** Play Console $25 one-time                    | External account |
| Privacy notice text                         | $0                                                                               | Content approval |

**Minimum paid P2C:** $25/month (Pro), plus optionally a one-time $25 (Play).
**Zero-cost P2C:** possible (Free + Firebase App Distribution; no e-mail provider needed), accepting no managed
backups and the pause risk. Not recommended for real personal data.
