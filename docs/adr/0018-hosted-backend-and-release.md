# ADR-0018: Hosted backend and Android release pipeline

- Status: accepted (G2, 2026-09-26)

## Decision

### Backend

Hosted Supabase in an EU region runs the migrations already verified locally:

- forced RLS, composite ownership FKs, the adoption and sync RPCs;
- the private `documents` bucket with path-based storage RLS;
- Auth with email OTP (code template in `supabase/templates/magic_link.html`).

Account creation stays optional and delayed (spec §16). The local-first sync (ADR-0011) and
adoption (ADR-0010) are unchanged.

The steps are in `docs/release/HOSTED_SUPABASE_RUNBOOK.md`. They are executed only after approval
of project creation, secrets, SMTP/DNS and any plan or payment.

### Android build

The builds use **Expo EAS Build** with the profiles in `eas.json`:

- `development`: a dev client;
- `preview`: an internal APK for Galaxy A54 acceptance;
- `production`: an AAB.

The sequence is:

1. development;
2. EAS test build;
3. device acceptance;
4. corrections;
5. release build (AAB);
6. Google Play Internal Testing;
7. production later.

Signing credentials, EAS/Expo account actions and **any Play upload** are separate approvals; the
repository never publishes automatically.

## Consequences

- Cloud builds avoid the non-ASCII local path problem (ADR-0005).
- Release configuration uses hosted env values (never `.env.local`).
