# ADR-0010: Local identity and transactional account adoption

- Status: accepted
- Date: 2026-09-26

## Context

Registration must not block first use (spec §16). An account exists so long-lived history survives device loss, and moving local data into it must never lose or corrupt anything.

## Decision

- **Local identity:** a device-local `LocalProfile` owns all data until adoption. Nothing leaves the device before sign-in.
- **Offer policy (`accountOfferDecision`):** the account is offered only once history or documents exist (a vehicle alone doesn't count). It's framed as backup, and "not now" snoozes the offer for 14 days.
- **Adoption (`adoptLocalData`):**
  1. Persist the state `pending` (with attempt count) in local settings.
  2. Build a snapshot of every local table, mapped to cloud columns. Device-only settings are excluded.
  3. Call RPC `adopt_local_data(jsonb)`: one server transaction, SECURITY INVOKER (RLS and composite FKs apply), `ON CONFLICT DO NOTHING` (idempotent).
  4. Read back every row key under the caller's RLS. Only if all are present, link the local profile to the account (`account_user_id`) and mark `adopted`.
- **Never destructive:** adoption doesn't modify or delete local rows. Every failure leaves `pending` plus a reason (`not_signed_in`, `network`, `server_rejected`, `verification_mismatch`) and can be retried after restart.
- A device already linked to account A refuses adoption into account B (`different_account`).

## Consequences

- An ID collision with another user's row (even a hostile one) surfaces as `verification_mismatch`, never as silent loss or a leak. Recovery needs support-level investigation, which is acceptable given UUIDv4.
- Changes made after adoption are carried by sync (M09) from the adoption point.
