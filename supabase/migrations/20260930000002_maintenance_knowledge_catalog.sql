-- Shared reusable maintenance knowledge (owner instruction 2026-09-29, "MAINTENANCE IS NOW THE
-- ONLY PRODUCT PRIORITY"; docs/release/MAINTENANCE_DISCOVERY.md).
--
-- PREPARED, NOT APPLIED to staging or production: applying it needs owner approval. Verified on
-- the local Docker stack only.
--
-- One row = one verified atomic maintenance requirement at the vehicle-class scope its source
-- proves. There is deliberately NO owner, vehicle, plate or VIN column: knowledge is keyed by
-- vehicle class (scope_key) so the next identical vehicle reuses it. Rows are written only by the
-- server-side discovery pipeline (service role); signed-in users can read; anon has no access.
-- Rows are never deleted by the app: a newer source edition sets superseded_by, conflicts are
-- recorded on both rows.

create table public.maintenance_knowledge_catalog (
  id text primary key check (length(id) between 8 and 200),
  scope_key text not null check (length(scope_key) <= 4000),
  task text not null check (task ~ '^[a-z_]{3,40}$'),
  action text not null check (action in ('inspection','replacement','adjustment','other')),
  requirement jsonb not null,
  source_url text not null check (source_url ~ '^https://'),
  source_host text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source jsonb not null,
  verified_at date not null,
  superseded_by text references public.maintenance_knowledge_catalog(id) deferrable initially deferred,
  conflicts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Defence in depth: a scope never carries personal identifiers.
  constraint scope_has_no_personal_keys
    check (scope_key !~* '"(plate|vin|chassis|user|owner|account|email|phone)"')
);

create index maintenance_knowledge_catalog_scope_idx
  on public.maintenance_knowledge_catalog (scope_key, task, action);

alter table public.maintenance_knowledge_catalog enable row level security;
alter table public.maintenance_knowledge_catalog force row level security;

revoke all on public.maintenance_knowledge_catalog from anon;
revoke all on public.maintenance_knowledge_catalog from authenticated;
grant select on public.maintenance_knowledge_catalog to authenticated;

create policy maintenance_knowledge_catalog_read
  on public.maintenance_knowledge_catalog
  for select to authenticated
  using (true);
-- No insert/update/delete policy for authenticated: only the service role (bypasses RLS) writes.
