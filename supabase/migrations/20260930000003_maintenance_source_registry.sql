-- Israeli Maintenance Source Registry (M-SOURCE, 2026-09-30; docs/maintenance/ISRAEL_SOURCE_REGISTRY.md).
--
-- PREPARED, NOT APPLIED to staging or production: applying it needs owner approval. Verified on
-- the local Docker stack only. Additive: it creates new tables and adds nullable columns to the
-- (also unapplied) shared catalog of 20260930000002. Depends on 20260930000002.
--
-- Shared, NON-personal reference data: source systems, their access-policy versions, official
-- document versions (identity + sha256; never the document), and the review state of catalog
-- requirements. No owner, user, vehicle, plate or VIN column. Signed-in users read; only the
-- service role (server-side pipeline / curator tool) writes; anon has no access.
--
-- Rollback (reverse order): alter table public.maintenance_knowledge_catalog drop column
-- review_decision, reviewed_by_role, reviewed_at, source_system_id, document_version_id;
-- drop table public.maintenance_document_versions, public.maintenance_source_policy_versions,
-- public.maintenance_source_systems; drop function public.tg_forbid_policy_rewrite(),
-- public.valid_policy_dimensions(jsonb).

create table public.maintenance_source_systems (
  source_system_id text primary key check (source_system_id ~ '^(il|global|eu|uk|us)-[a-z0-9]+(-[a-z0-9]+)*$'),
  manufacturers text[] not null check (cardinality(manufacturers) > 0),
  importer text,
  market text not null,
  origin text not null check (origin in ('israeli','global')),
  source_type text not null check (source_type in
    ('A_DIRECT_MAINTENANCE_SCHEDULE','B_DIGITAL_MANUAL','C_STRUCTURED_WEB_MANUAL','D_RESTRICTED_OR_UNAVAILABLE')),
  authority_class text not null check (authority_class in ('importer','manufacturer','manufacturer_library')),
  status text not null check (status in ('approved','proposed','rejected')),
  record jsonb not null,
  updated_at timestamptz not null default now(),
  -- An Israeli system is official for IL; a global one never claims IL.
  constraint israeli_market check ((origin = 'israeli') = (market = 'IL'))
);

-- The six policy dimensions, each present and one of the four values.
create function public.valid_policy_dimensions(d jsonb) returns boolean
language sql immutable as $$
  select coalesce(bool_and(d ? k and d -> k ->> 'value' in ('ALLOWED','NOT_ALLOWED','UNKNOWN','REQUIRES_PERMISSION')), false)
  from unnest(array['discoveryAllowed','automatedFetchAllowed','automatedExtractionAllowed',
                    'documentCachingAllowed','structuredFactsStorageAllowed',
                    'documentRedistributionAllowed']) as k
$$;

create table public.maintenance_source_policy_versions (
  source_system_id text not null references public.maintenance_source_systems(source_system_id) on delete restrict,
  version integer not null check (version >= 1),
  reviewed_at date not null,
  dimensions jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (source_system_id, version),
  constraint six_dimensions check (public.valid_policy_dimensions(dimensions))
);

-- Policy history is an audit trail: versions are appended, never rewritten or deleted.
create function public.tg_forbid_policy_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception 'maintenance_source_policy_versions is append-only';
end $$;
create trigger forbid_policy_rewrite before update or delete on public.maintenance_source_policy_versions
  for each row execute function public.tg_forbid_policy_rewrite();

create table public.maintenance_document_versions (
  id uuid primary key default gen_random_uuid(),
  source_system_id text references public.maintenance_source_systems(source_system_id) on delete restrict,
  document_key text not null,
  url text not null check (url ~ '^https://'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null check (version >= 1),
  first_seen_at date not null,
  last_seen_at date not null check (last_seen_at >= first_seen_at),
  unique (document_key, sha256),
  unique (document_key, version)
);
create index maintenance_document_versions_sha on public.maintenance_document_versions(sha256);

alter table public.maintenance_knowledge_catalog
  add column document_version_id uuid references public.maintenance_document_versions(id) on delete restrict,
  add column source_system_id text references public.maintenance_source_systems(source_system_id) on delete restrict,
  add column review_decision text check (review_decision in ('APPROVE','CORRECT','REJECT')),
  add column reviewed_by_role text check (reviewed_by_role in ('curator','technician')),
  add column reviewed_at date,
  -- A decision always names who (by role) and when; the vehicle owner is never a reviewer.
  add constraint review_complete check (
    (review_decision is null and reviewed_by_role is null and reviewed_at is null)
    or (review_decision is not null and reviewed_by_role is not null and reviewed_at is not null)
  );
create index maintenance_knowledge_catalog_document on public.maintenance_knowledge_catalog(document_version_id);
create index maintenance_knowledge_catalog_system on public.maintenance_knowledge_catalog(source_system_id);

do $$
declare t text;
begin
  foreach t in array array['maintenance_source_systems','maintenance_source_policy_versions',
                           'maintenance_document_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;
