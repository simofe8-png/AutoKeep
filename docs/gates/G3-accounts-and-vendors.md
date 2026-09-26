# Gate G3 — accounts, credentials and vendors (2026-09-26)

G2 approved the architecture. Everything that decision allows without accounts, credentials,
vendor choices or money is implemented and verified (see `task-plan.md` § G2 implementation).
Each remaining step needs an explicit approval under the G2 decision record's rule: stop
immediately before account creation, credentials, signing, payment or vendor choice.

The list is in the order of the approved release sequence.

## 1. EAS test build (unblocks: Galaxy A54 acceptance of a real build)

| Action          | Needed from you                                                                                                                                        | Cost / effect                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Expo account    | Create or choose an Expo account, then either run `npx eas-cli login` yourself or give me an access token (`EXPO_TOKEN`, kept only in the session env) | Free tier; builds are queued, with a monthly quota                                |
| `eas init`      | OK to link the project, which writes `extra.eas.projectId` into `app.json` (a local commit)                                                            | Reversible                                                                        |
| Android signing | OK for **EAS-managed keystore** (recommended), or provide your own upload keystore                                                                     | The keystore identifies the app on Google Play forever, so keep EAS's backup safe |
| First build     | OK to run `eas build --profile preview --platform android`, an internal APK                                                                            | Uses the build quota; no store upload                                             |

**Recommendation:** approve all four. Once the APK is built, I'll install it on the Galaxy A54 over
adb and run the device acceptance: native RTL inputs, camera capture storage, local notifications
(unavailable in Expo Go), registry lookup when the phone is online, and all core journeys.

## 2. Hosted Supabase, EU (unblocks: real accounts / backup in release builds)

| Action                                                                         | Needed from you                                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Supabase account/org and **plan** (Free for a pilot / Pro before real users)   | Create it, or approve me to use a token you provide                     |
| Project creation (EU region) and `supabase db push` of the verified migrations | Approval, which is a hosted-resource creation and a production mutation |
| SMTP provider and sender-domain DNS (SPF/DKIM) for the code email              | Choose a provider and domain                                            |

The steps are in `docs/release/HOSTED_SUPABASE_RUNBOOK.md`.

## 3. Runtime vendors (unblocks: verified schedules, scan and invoice reading in production)

| Port                                            | Choice needed                                                                        | Notes                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR/AI for the `document-intelligence` function | A vendor plus an API key, stored as a Supabase function secret                       | Recommendation: Anthropic Claude API (PDF/image input, strong Hebrew). Per-page cost. Documents leave the device, so the privacy notice must say so |
| Web discovery (`WebSearchPort`)                 | A search API vendor plus a key, or skip it and rely on the known-source registry     | Optional: the known-source registry works without it                                                                                                |
| Verified registry entries                       | Who verifies official domains and manual URLs (`docs/sources/REGISTRY_PROCEDURE.md`) | I can research candidates and prepare evidence for your sign-off, but an entry grants authority, so a person must approve it                        |

## 4. Later, as separate gates

- Google Play Console account (one-time fee) and any Internal Testing upload.
- Production release.

## Decision record (user, 2026-09-26): ZERO-COST V1

1. **Cost.** Zero paid services: local/open-source, genuinely free tiers, existing infrastructure.
   No purchase, subscription or upgrade. If payment becomes mandatory, stop and report the
   requirement and the zero-cost alternatives.
2. **Android.** Free Expo account, `eas init`, EAS-managed signing and a test APK are approved if
   free. If EAS requires payment, use a zero-cost **local** build. The goal is a real build on the
   Galaxy A54 plus full device acceptance.
3. **Backend.** No Supabase Pro. Free tier where sufficient. The verified **local** backend may be
   the RC backend. Production hosting is a later gate.
4. **Email OTP.** No paid SMTP, email delivery or domain for RC. Production-grade delivery is
   documented as a future dependency. The account stays optional.
5. **Service recording.** Manual entry is the complete first-class workflow (date, odometer,
   work; garage and notes optional). Attachments work without OCR. OCR/AI stays an optional future
   convenience behind the interface; no paid provider for RC.
6. **Discovery.** Hybrid: verified registry → **zero-cost** web discovery → verification chain. No
   search API purchase. Unverifiable means "unable to verify". Never fabricate.
7. **Registry.** Claude may research and prepare candidates with evidence; a **human approves**
   each trusted source.

### Outcomes so far

- **EAS.** The project was linked to the existing free account `@vr47252/autokeep`, and an
  EAS-managed keystore was created (free). The free plan's Android builds for this month are
  used up (they reset 2026-10-01), and a Starter subscription is the paid path, so it was
  **declined**. The zero-cost local Gradle build path is being used instead (ADR-0018, amended).
- **Web discovery at zero cost:** the robots.txt/sitemap crawl of verified official domains only
  (ADR-0016, amended).
- **Local build: retry budget exhausted (5/5).** Every path is now ASCII except the Android SDK.
  CMake canonicalizes the SDK junction back to the Hebrew path. The attempt log and the two
  zero-cost options (a real ASCII SDK copy, or the EAS free quota after 2026-10-01) are in
  `docs/release/LOCAL_BUILD.md`.
- **Verified schedules without paid OCR/AI:** human-curated schedules pinned by hash, plus the
  `npm run curate:check` tool (ADR-0017 amendment, REGISTRY_PROCEDURE).
- **Registry candidates:** researched with evidence in `docs/sources/CANDIDATES.md`. They are
  **pending human approval**, and nothing is marked trusted.
- **Backend / e-mail:** the verified local Supabase stack remains the RC backend. Hosted
  production, SMTP and the domain are future dependencies (`HOSTED_SUPABASE_RUNBOOK.md`).
