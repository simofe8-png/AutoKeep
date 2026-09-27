-- Private Beta: invitation-only registration (Username + Password).
--
-- An invitation authorizes creating ONE account and nothing else. Only a SHA-256 hash of the
-- random invitation token is stored; the token itself exists only in the link the administrator
-- sends. The table and its functions are reachable by the service role only (the `register`
-- Edge Function and the administrator's script). Clients have no access at all.
--
-- Consumption is atomic under concurrency: a registration first CLAIMS the invitation (row lock,
-- one claimer at a time), creates the Auth identity, then COMPLETES the claim. A claim that is
-- not completed (failure, crash) is released or expires after 2 minutes. Completion re-checks
-- revocation, so an invitation revoked mid-registration never produces an account.
--
-- Deleting the account deletes its invitation row (cascade): no username stays behind.

create table public.beta_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  claim_id uuid,
  claimed_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete cascade,
  username text,
  check (expires_at > created_at),
  check ((consumed_at is null) = (consumed_by is null)),
  check (consumed_at is null or revoked_at is null)
);

alter table public.beta_invitations enable row level security;
alter table public.beta_invitations force row level security;
revoke all on public.beta_invitations from public, anon, authenticated;
grant select, insert, update, delete on public.beta_invitations to service_role;
-- The service role bypasses RLS; no policy exists for any other role.

/**
 * Claims an unused, unexpired, unrevoked invitation for one registration attempt.
 * outcome: 'ok' | 'invalid' (unknown or revoked) | 'used' | 'expired' | 'busy' (another attempt
 * holds a live claim).
 */
create or replace function public.claim_invitation(p_token_hash text)
returns table (outcome text, claim uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inv public.beta_invitations%rowtype;
  c uuid;
begin
  select * into inv from public.beta_invitations where token_hash = p_token_hash for update;
  if not found or inv.revoked_at is not null then
    return query select 'invalid'::text, null::uuid; return;
  end if;
  if inv.consumed_at is not null then
    return query select 'used'::text, null::uuid; return;
  end if;
  if inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid; return;
  end if;
  if inv.claimed_at is not null and inv.claimed_at > now() - interval '2 minutes' then
    return query select 'busy'::text, null::uuid; return;
  end if;
  c := gen_random_uuid();
  update public.beta_invitations set claim_id = c, claimed_at = now() where id = inv.id;
  return query select 'ok'::text, c;
end;
$$;

create or replace function public.release_invitation(p_claim uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.beta_invitations set claim_id = null, claimed_at = null
  where claim_id = p_claim and consumed_at is null;
$$;

/** Marks the claimed invitation consumed by the new account. False = the claim is no longer valid. */
create or replace function public.complete_invitation(p_claim uuid, p_user uuid, p_username text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.beta_invitations
  set consumed_at = now(), consumed_by = p_user, username = p_username,
      claim_id = null, claimed_at = null
  where claim_id = p_claim and consumed_at is null and revoked_at is null
    and claimed_at > now() - interval '2 minutes';
  return found;
end;
$$;

revoke all on function public.claim_invitation(text) from public, anon, authenticated;
revoke all on function public.release_invitation(uuid) from public, anon, authenticated;
revoke all on function public.complete_invitation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_invitation(text) to service_role;
grant execute on function public.release_invitation(uuid) to service_role;
grant execute on function public.complete_invitation(uuid, uuid, text) to service_role;
