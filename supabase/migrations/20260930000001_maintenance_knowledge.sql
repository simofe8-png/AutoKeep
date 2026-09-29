-- Maintenance knowledge (owner run 2026-09-29; docs/release/MAINTENANCE_M1.md).
--
-- PREPARED, NOT APPLIED to staging or production: applying it needs owner approval. It mirrors
-- the local-only SQLite tables of migration v6. Until it is applied, these rows stay on the
-- device (they are not in SYNC_TABLES). Completion links need no cloud change: they use the
-- existing service_actions.maintenance_item_id (a deterministic uuid per vehicle + task).
--
-- Every row is owned (owner_id = auth.uid()) and vehicle-scoped; RLS is forced and anon has no
-- access, exactly like the other vehicle tables.

create table public.maintenance_profiles (
  vehicle_id uuid primary key,
  owner_id uuid not null default auth.uid(),
  in_service_date date,
  in_service_precision text check (in_service_precision in ('day','month')),
  in_service_source text check (in_service_source in ('registry','user')),
  service_regime text check (service_regime is null or length(service_regime) <= 16),
  usage text check (usage in ('normal','severe')),
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);

create table public.knowledge_documents (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  document_id uuid,
  origin text not null check (origin in ('user_upload','official_download','catalog_edition')),
  title text not null,
  authority text not null check (authority in
    ('importer','manufacturer','official_publication','vehicle_document','user_report','secondary')),
  markets jsonb not null default '[]'::jsonb,
  edition text,
  published_on date,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer,
  authenticity text not null check (authenticity in
    ('unconfirmed','owner_confirmed','matched_official_edition','curator_verified')),
  owner_confirmed_at date,
  -- A user's upload is never redistributed without rights.
  rights text not null check (rights in ('none','structured_facts_only','redistributable')),
  excerpt_policy text not null check (excerpt_policy in ('none','short_allowed')),
  coverage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade,
  foreign key (document_id, owner_id) references public.documents(id, owner_id) on delete cascade,
  -- Target of the owner-scoped claim FK below (M-SOURCE review 2026-09-30).
  unique (id, owner_id)
);
create index knowledge_documents_vehicle on public.knowledge_documents(vehicle_id);

create table public.maintenance_claims (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  knowledge_document_id uuid not null,
  task text not null,
  task_text text,
  action text not null check (action in ('inspection','replacement','adjustment','other')),
  interval jsonb not null,
  applicability jsonb not null default '{}'::jsonb,
  locator jsonb not null,
  -- Short excerpts only (no reproduction of manual text).
  excerpt text check (excerpt is null or length(excerpt) <= 160),
  extraction jsonb not null,
  status text not null check (status in ('candidate','accepted','rejected')),
  review jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade,
  -- Owner-scoped: a claim can only cite the SAME owner's document (M-SOURCE review 2026-09-30;
  -- the earlier single-column FK let a user link another owner's document id).
  foreign key (knowledge_document_id, owner_id)
    references public.knowledge_documents(id, owner_id) on delete cascade
);
create index maintenance_claims_vehicle on public.maintenance_claims(vehicle_id);
create index maintenance_claims_document on public.maintenance_claims(knowledge_document_id);

do $$
declare t text;
begin
  foreach t in array array['maintenance_profiles','knowledge_documents','maintenance_claims'] loop
    execute format('create trigger set_server_updated_at before insert or update on public.%I
                    for each row execute function public.tg_set_server_updated_at()', t);
    execute format('create trigger forbid_owner_change before update on public.%I
                    for each row execute function public.tg_forbid_owner_change()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy owner_select on public.%I for select to authenticated
                    using (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated
                    with check (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_update on public.%I for update to authenticated
                    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated
                    using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;
