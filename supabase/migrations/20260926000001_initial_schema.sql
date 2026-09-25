-- AutoKeep cloud schema v1 (M07: T059 schema, T061 ownership/RLS, T062 private storage, T063 RPC).
-- Mirrors the local SQLite schema (ADR-0008). Every row belongs to owner_id = auth.uid();
-- vehicle-scoped rows reference vehicles(id, owner_id) so a client-supplied vehicle_id can never
-- attach data to another user's vehicle (BOLA/IDOR defense in depth, besides RLS).

-- ---------- helpers ----------

create or replace function public.tg_set_server_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

create or replace function public.tg_forbid_owner_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table public.vehicles (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  type text not null check (type in ('car','motorcycle','scooter')),
  manufacturer text not null,
  model text not null,
  year integer not null check (year between 1950 and 2100),
  trim text, model_code text, engine text, fuel text, transmission text,
  registration text not null check (registration ~ '^[0-9]{5,8}$'),
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  lifecycle text not null check (lifecycle in ('active','archived')),
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index vehicles_owner_idx on public.vehicles(owner_id);

create table public.odometer_readings (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  value_km integer not null check (value_km between 0 and 2000000),
  measured_at date not null,
  source text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);
create index odometer_vehicle_idx on public.odometer_readings(vehicle_id);

create table public.documents (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  kind text not null check (kind in ('owners_manual','maintenance_schedule','invoice','registration','other')),
  title text not null,
  origin text not null,
  authority text not null,
  storage_key text not null check (storage_key !~* '^https?:'),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/heic')),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer,
  verification jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);
create index documents_vehicle_idx on public.documents(vehicle_id);

create table public.extractions (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  document_id uuid not null,
  kind text not null,
  status text not null,
  produced_by text not null,
  payload jsonb not null,
  uncertain_fields jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade,
  foreign key (document_id, owner_id) references public.documents(id, owner_id) on delete cascade
);

create table public.schedules (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  intervals jsonb not null,
  evidence jsonb not null,
  applicability jsonb not null,
  verification jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);

create table public.service_events (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  date date not null,
  odometer_km integer not null check (odometer_km between 0 and 2000000),
  garage_name text,
  notes text,
  origin text not null check (origin in ('manual','document')),
  extraction_id uuid,
  authority text not null,
  verification jsonb not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);
create index service_events_vehicle_idx on public.service_events(vehicle_id, date);

create table public.service_actions (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  service_event_id uuid not null,
  position integer not null,
  title text not null,
  action_type text not null check (action_type in ('inspection','replacement','other')),
  performed boolean not null,
  maintenance_item_id uuid,
  unlisted boolean not null,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade,
  foreign key (service_event_id, owner_id) references public.service_events(id, owner_id) on delete cascade
);

create table public.service_event_documents (
  owner_id uuid not null default auth.uid(),
  service_event_id uuid not null,
  document_id uuid not null,
  server_updated_at timestamptz not null default now(),
  primary key (service_event_id, document_id),
  foreign key (service_event_id, owner_id) references public.service_events(id, owner_id) on delete cascade,
  foreign key (document_id, owner_id) references public.documents(id, owner_id) on delete cascade
);

create table public.garage_recommendations (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  text text not null,
  date date not null,
  garage_name text,
  source_document_id uuid,
  authority text not null check (authority in ('garage_document','user_report')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);

create table public.deferred_items (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  maintenance_item_id uuid not null,
  deferred_at date not null,
  service_event_id uuid,
  reason text,
  resolved_by_service_event_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);

create table public.alerts (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  kind text not null check (kind in ('upcoming','overdue','deferred','stale_odometer')),
  status text not null check (status in ('active','handled','deferred')),
  basis jsonb not null,
  raised_at timestamptz not null,
  snoozed_until date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  server_updated_at timestamptz not null default now(),
  foreign key (vehicle_id, owner_id) references public.vehicles(id, owner_id) on delete cascade
);

-- ---------- triggers + RLS for every table ----------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','vehicles','odometer_readings','documents','extractions','schedules',
    'service_events','service_actions','service_event_documents','garage_recommendations',
    'deferred_items','alerts'
  ] loop
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

-- ---------- RPC (SECURITY INVOKER: RLS applies) ----------

create or replace function public.vehicle_deletion_preview(p_vehicle_id uuid)
returns table (service_events bigint, documents bigint, odometer_readings bigint, alerts bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.service_events where vehicle_id = p_vehicle_id),
    (select count(*) from public.documents where vehicle_id = p_vehicle_id),
    (select count(*) from public.odometer_readings where vehicle_id = p_vehicle_id),
    (select count(*) from public.alerts where vehicle_id = p_vehicle_id);
$$;

create or replace function public.delete_vehicle_permanently(p_vehicle_id uuid)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  delete from public.vehicles where id = p_vehicle_id and owner_id = auth.uid();
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.vehicle_deletion_preview(uuid) from public, anon;
revoke all on function public.delete_vehicle_permanently(uuid) from public, anon;
grant execute on function public.vehicle_deletion_preview(uuid) to authenticated;
grant execute on function public.delete_vehicle_permanently(uuid) to authenticated;

-- ---------- private document storage (T062) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800,
        array['application/pdf','image/jpeg','image/png','image/heic'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {owner_id}/{vehicle_id}/{document_id}. The owner folder must be the caller and the
-- vehicle folder must be a vehicle the caller owns.
create or replace function public.can_access_document_path(p_name text)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select (storage.foldername(p_name))[1] = (select auth.uid())::text
     and exists (
       select 1 from public.vehicles v
       where v.id::text = (storage.foldername(p_name))[2]
         and v.owner_id = (select auth.uid())
     );
$$;
grant execute on function public.can_access_document_path(text) to authenticated;

create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_document_path(name));
create policy documents_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name))
  with check (bucket_id = 'documents' and public.can_access_document_path(name));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));
