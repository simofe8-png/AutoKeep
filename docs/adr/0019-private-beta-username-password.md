# ADR-0019: Private Beta sign-in, Invitation → Username + Password

- **Status:** Accepted (owner decision, 2026-09-28). Supersedes the e-mail-code sign-in of M19 and
  the Gmail SMTP plan (P2C pre-gate) for the Private Beta.
- **Context:** Real testers need sign-in without a custom domain. E-mail codes need a sending
  service that can reach arbitrary addresses, and Supabase Free's built-in sender cannot. The
  owner chose no e-mail at all: invite-only accounts with a username and password, and no
  password policy of AutoKeep's own.

## Decision

1. **Supabase Auth stays the authority.** Passwords are hashed and verified only by Supabase
   Auth; there is no custom password crypto.
2. **Username → identity:** a deterministic internal address
   `u<sha256(v1 + normalized username)[:40]>@users.autokeep.invalid` (a reserved TLD, never
   mailed, never shown). Sign-in is the standard `signInWithPassword`, with no lookup endpoint
   and therefore no username enumeration. Uniqueness comes from Auth's unique e-mail.
3. **Invite-only:** public sign-up is off. The `register` Edge Function is the only way to
   create an account. It holds the service-role key, and the invitation token is its only
   authorization. Invitations are stored as SHA-256 hashes and are single-use, expiring and
   revocable. A claim/complete protocol under a row lock makes consumption atomic with account
   creation.
4. **Password limits** are only the provider's: at least 6 characters (Supabase's hard floor)
   and at most 72 bytes (bcrypt). They are presented as provider constraints.
5. **Recovery** is administrator-assisted (set, never read) through `tools/beta-admin.mjs`.
   There is no e-mail, OTP or security-question recovery.

## Consequences

- There is no self-service recovery. A lost password needs the administrator. This is
  acceptable for a closed beta; revisit before a public release (for example Google Sign-In,
  P2C §2 option C).
- The derivation of the internal identifier is part of the account's identity. It is versioned
  (`v1`) and defined once (`supabase/functions/_shared/username.ts`); changing it would need a
  migration of existing accounts.
- The password transits the `register` function once, over TLS, to reach the Auth admin API.
  It is never stored, logged or returned.
- The same identity model works for a future beta or production project. The operator tool has
  no production target on purpose.
