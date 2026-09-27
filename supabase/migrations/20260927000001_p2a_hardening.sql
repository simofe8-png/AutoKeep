-- P2A: production hardening (docs/release/P2_PRODUCTION_BACKEND_PLAN.md §B). Forward-only.
--   1. least-privilege grants (A1)
--   2. indexes for the sync pull and cascades (A5)
--   3. server-authoritative versions, immutable append-only rows (A3)
--   4. per-owner op ledger; sync_push isolates invalid ops (Y3) and caps its input (A4)
--   5. adoption input cap (A4); unused deletion RPCs removed (A2)
--   6. column size limits; document type/size limits and per-owner quotas (S2)
--   7. storage: one object per owned document row, insert-only (S2, S4)
--   8. operator storage report

-- ---------- 1. least privilege ----------
do $$
declare
  t text;
  domain_tables text[] := array['profiles','vehicles','odometer_readings','documents','extractions',
    'schedules','service_events','service_actions','service_event_documents',
    'garage_recommendations','deferred_items','alerts'];
  mutable_tables text[] := array['profiles','vehicles','deferred_items','alerts'];
begin
  foreach t in array domain_tables || array['sync_applied_ops','sync_tombstones'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
  -- Reads (pull), inserts (adoption, sync_push). Both RPCs are SECURITY INVOKER.
  foreach t in array domain_tables loop
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
  -- Compare-and-set updates exist only for mutable entities.
  foreach t in array mutable_tables loop
    execute format('grant update on public.%I to authenticated', t);
  end loop;
end $$;
-- Deletion is only ever a whole vehicle (children cascade as the table owner).
grant delete on public.vehicles to authenticated;
grant select, insert on public.sync_applied_ops to authenticated;
grant select, insert, update on public.sync_tombstones to authenticated; -- tombstone upsert

-- Future objects are not exposed by default; every migration grants explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke all on function public.can_access_document_path(text) from public, anon;
grant execute on function public.can_access_document_path(text) to authenticated;
revoke all on function public.tg_set_server_updated_at() from public, anon;
revoke all on function public.tg_forbid_owner_change() from public, anon;

-- ---------- 2. indexes ----------
-- The pull reads each table under RLS (owner_id = auth.uid()) ordered by (server_updated_at, key).
create index profiles_pull_idx on public.profiles (owner_id, server_updated_at, id);
create index vehicles_pull_idx on public.vehicles (owner_id, server_updated_at, id);
create index odometer_pull_idx on public.odometer_readings (owner_id, server_updated_at, id);
create index documents_pull_idx on public.documents (owner_id, server_updated_at, id);
create index extractions_pull_idx on public.extractions (owner_id, server_updated_at, id);
create index schedules_pull_idx on public.schedules (owner_id, server_updated_at, id);
create index service_events_pull_idx on public.service_events (owner_id, server_updated_at, id);
create index service_actions_pull_idx on public.service_actions (owner_id, server_updated_at, id);
create index sed_pull_idx on public.service_event_documents
  (owner_id, server_updated_at, service_event_id, document_id);
create index garage_recs_pull_idx on public.garage_recommendations (owner_id, server_updated_at, id);
create index deferred_pull_idx on public.deferred_items (owner_id, server_updated_at, id);
create index alerts_pull_idx on public.alerts (owner_id, server_updated_at, id);
create index tombstones_pull_idx on public.sync_tombstones (owner_id, server_updated_at, entity_id);
-- Foreign keys used by cascades (vehicle deletion, account deletion).
create index extractions_vehicle_idx on public.extractions (vehicle_id);
create index extractions_document_idx on public.extractions (document_id);
create index schedules_vehicle_idx on public.schedules (vehicle_id);
create index service_actions_vehicle_idx on public.service_actions (vehicle_id);
create index service_actions_event_idx on public.service_actions (service_event_id);
create index sed_document_idx on public.service_event_documents (document_id);
create index garage_recs_vehicle_idx on public.garage_recommendations (vehicle_id);
create index deferred_vehicle_idx on public.deferred_items (vehicle_id);
create index alerts_vehicle_idx on public.alerts (vehicle_id);
create index vehicles_profile_idx on public.vehicles (profile_id);

-- ---------- 3. versions are server-authoritative ----------
create or replace function public.tg_bump_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Whatever the client sent: an update moves the version by exactly one, created_at is fixed.
  new.version := old.version + 1;
  new.created_at := old.created_at;
  return new;
end $$;

create or replace function public.tg_forbid_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '42501';
end $$;

revoke all on function public.tg_bump_version() from public, anon;
revoke all on function public.tg_forbid_update() from public, anon;

do $$
declare t text;
begin
  foreach t in array array['profiles','vehicles','deferred_items','alerts'] loop
    execute format('create trigger bump_version before update on public.%I
                    for each row execute function public.tg_bump_version()', t);
    execute format('alter table public.%I add constraint %I check (version >= 1)', t, t || '_version_positive');
  end loop;
  foreach t in array array['odometer_readings','documents','extractions','schedules',
      'service_events','service_actions','service_event_documents','garage_recommendations'] loop
    execute format('create trigger forbid_update before update on public.%I
                    for each row execute function public.tg_forbid_update()', t);
  end loop;
end $$;

-- ---------- 4. op ledger per owner; sync_push ----------
alter table public.sync_applied_ops drop constraint sync_applied_ops_pkey;
alter table public.sync_applied_ops add primary key (owner_id, op_id);

create or replace function public.sync_push(p_ops jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  op jsonb;
  t text;
  v_op_id uuid;
  v_entity uuid;
  payload jsonb;
  base integer;
  cols text;
  upd_cols text;
  n integer;
  v_version integer;
  found_row boolean;
  server_row jsonb;
  cache jsonb := '{}'::jsonb;
  results jsonb := '[]'::jsonb;
  append_only text[] := array['odometer_readings','documents','extractions','schedules',
    'service_events','service_actions','service_event_documents','garage_recommendations'];
  mutable text[] := array['profiles','vehicles','deferred_items','alerts'];
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'p_ops must be an array of at most 200 operations' using errcode = '54000';
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    -- Each op runs in its own subtransaction: a permanently invalid op is reported as 'invalid'
    -- and never blocks the others. Transient failures (timeouts, locks) still fail the batch.
    begin
      v_op_id := (op->>'op_id')::uuid;
      if v_op_id is null then
        raise exception 'op_id is required' using errcode = '22023';
      end if;
      t := op->>'table';

      if exists (select 1 from public.sync_applied_ops a
                  where a.owner_id = uid and a.op_id = v_op_id) then
        results := results || jsonb_build_object('op_id', v_op_id, 'status', 'duplicate');
        continue;
      end if;

      if t is null or not (t = any(append_only) or t = any(mutable)) then
        raise exception 'table % is not synced', t using errcode = '22023';
      end if;

      if op->>'op' = 'delete' then
        if t <> 'vehicles' then
          raise exception 'delete is only supported for vehicles' using errcode = '22023';
        end if;
        v_entity := (op->>'entity_id')::uuid;
        delete from public.vehicles v where v.id = v_entity and v.owner_id = uid;
        get diagnostics n = row_count;
        if n = 0 and not exists (select 1 from public.sync_tombstones s
             where s.owner_id = uid and s.entity_table = 'vehicles' and s.entity_id = v_entity) then
          -- Never existed in this account (or belongs to someone else): nothing to propagate.
          insert into public.sync_applied_ops (op_id) values (v_op_id);
          results := results || jsonb_build_object('op_id', v_op_id, 'status', 'rejected');
          continue;
        end if;
        insert into public.sync_tombstones (entity_table, entity_id)
          values ('vehicles', v_entity)
          on conflict (owner_id, entity_table, entity_id)
          do update set deleted_at = now(), server_updated_at = now();
        insert into public.sync_applied_ops (op_id) values (v_op_id);
        results := results || jsonb_build_object('op_id', v_op_id, 'status', 'applied');
        continue;
      end if;

      if op->>'op' is distinct from 'upsert' then
        raise exception 'unknown op %', op->>'op' using errcode = '22023';
      end if;
      payload := op->'row';
      if jsonb_typeof(payload) is distinct from 'object' then
        raise exception 'row is required' using errcode = '22023';
      end if;
      base := coalesce((op->>'base_version')::integer, 0);

      cols := cache->>t;
      if cols is null then
        select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
          into cols
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t
           and c.column_name not in ('owner_id', 'server_updated_at');
        select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
          into upd_cols
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t
           and c.column_name not in ('owner_id', 'server_updated_at', 'id', 'created_at', 'version');
        cache := cache || jsonb_build_object(t, cols, t || ':upd', upd_cols);
      end if;
      upd_cols := cache->>(t || ':upd');

      execute format(
        'insert into public.%1$I (owner_id, %2$s)
           select (select auth.uid()), %2$s from jsonb_populate_record(null::public.%1$I, $1)
         on conflict do nothing', t, cols)
        using payload;
      get diagnostics n = row_count;

      if n = 1 then
        insert into public.sync_applied_ops (op_id) values (v_op_id);
        results := results || jsonb_build_object('op_id', v_op_id, 'status', 'applied',
          'version', case when t = any(mutable) then (payload->>'version')::integer end);
      elsif t = any(append_only) then
        -- Already present. Only the caller's own row counts as a duplicate (RLS limits the
        -- lookup to it); an id held by another account is reported as invalid.
        if t = 'service_event_documents' then
          select exists (select 1 from public.service_event_documents d
                          where d.service_event_id = (payload->>'service_event_id')::uuid
                            and d.document_id = (payload->>'document_id')::uuid)
            into found_row;
        else
          execute format('select exists (select 1 from public.%I x where x.id = ($1->>''id'')::uuid)', t)
            into found_row using payload;
        end if;
        if not found_row then
          raise exception 'id is not available' using errcode = '23505';
        end if;
        insert into public.sync_applied_ops (op_id) values (v_op_id);
        results := results || jsonb_build_object('op_id', v_op_id, 'status', 'duplicate');
      else
        -- Mutable: compare-and-set on the version the client started from. The new version is
        -- decided by the server (bump_version trigger), never taken from the client.
        v_version := null;
        execute format(
          'update public.%1$I x set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1))
            where x.id = ($1->>''id'')::uuid and x.version = $2
          returning x.version', t, upd_cols)
          into v_version using payload, base;
        if v_version is not null then
          insert into public.sync_applied_ops (op_id) values (v_op_id);
          results := results || jsonb_build_object('op_id', v_op_id, 'status', 'applied',
            'version', v_version);
        else
          execute format('select to_jsonb(x) from public.%I x where x.id = ($1->>''id'')::uuid', t)
            into server_row using payload;
          results := results || jsonb_build_object(
            'op_id', v_op_id,
            'status', case when server_row is null then 'rejected' else 'conflict' end,
            'server_row', server_row);
        end if;
      end if;
    exception
      when data_exception or integrity_constraint_violation or insufficient_privilege then
        results := results || jsonb_build_object(
          'op_id', op->>'op_id', 'status', 'invalid', 'code', sqlstate, 'message', left(sqlerrm, 200));
    end;
  end loop;
  return results;
end $$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- ---------- 5. adoption cap; unused RPCs ----------
create or replace function public.adopt_local_data(p_bundle jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  t text;
  cols text;
  inserted bigint;
  total bigint;
  result jsonb := '{}'::jsonb;
  tables text[] := array[
    'profiles','vehicles','odometer_readings','documents','extractions','schedules',
    'service_events','service_actions','service_event_documents','garage_recommendations',
    'deferred_items','alerts'
  ];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_bundle) is distinct from 'object' then
    raise exception 'p_bundle must be an object' using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(v)), 0) into total
    from jsonb_each(p_bundle) e(k, v) where jsonb_typeof(v) = 'array';
  if total > 50000 then
    raise exception 'bundle exceeds 50000 rows' using errcode = '54000';
  end if;
  foreach t in array tables loop
    if p_bundle ? t then
      select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
        into cols
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = t
         and c.column_name not in ('owner_id', 'server_updated_at');
      execute format(
        'insert into public.%1$I (owner_id, %2$s)
           select (select auth.uid()), %2$s
             from jsonb_populate_recordset(null::public.%1$I, $1)
         on conflict do nothing',
        t, cols)
        using p_bundle -> t;
      get diagnostics inserted = row_count;
      result := result || jsonb_build_object(t, inserted);
    end if;
  end loop;
  return result;
end $$;

revoke all on function public.adopt_local_data(jsonb) from public, anon;
grant execute on function public.adopt_local_data(jsonb) to authenticated;

-- A deletion that bypasses sync_push leaves no tombstone for the user's other devices.
drop function public.delete_vehicle_permanently(uuid);
drop function public.vehicle_deletion_preview(uuid);

-- ---------- 6. size limits and quotas ----------
alter table public.vehicles
  add constraint vehicles_text_len check (
    char_length(manufacturer) <= 100 and char_length(model) <= 100
    and coalesce(char_length(trim), 0) <= 100 and coalesce(char_length(model_code), 0) <= 100
    and coalesce(char_length(engine), 0) <= 100 and coalesce(char_length(fuel), 0) <= 100
    and coalesce(char_length(transmission), 0) <= 100);
alter table public.documents
  add constraint documents_title_len check (char_length(title) <= 300),
  add constraint documents_json_size check (coalesce(octet_length(verification::text), 0) <= 65536),
  -- Photos of invoices/licenses are well below 15 MB; PDFs (owner's manuals) up to the 50 MB cap.
  add constraint documents_image_size check (mime_type = 'application/pdf' or size_bytes <= 15728640);
alter table public.extractions
  add constraint extractions_json_size check (
    octet_length(payload::text) <= 1048576
    and coalesce(octet_length(uncertain_fields::text), 0) <= 65536);
alter table public.schedules
  add constraint schedules_json_size check (
    octet_length(intervals::text) <= 524288 and octet_length(evidence::text) <= 65536
    and octet_length(applicability::text) <= 65536 and octet_length(verification::text) <= 65536);
alter table public.service_events
  add constraint service_events_text_len check (
    char_length(coalesce(garage_name, '')) <= 200 and char_length(coalesce(notes, '')) <= 5000
    and coalesce(octet_length(verification::text), 0) <= 65536);
alter table public.service_actions
  add constraint service_actions_title_len check (char_length(title) <= 300);
alter table public.garage_recommendations
  add constraint garage_recs_text_len check (
    char_length(text) <= 5000 and char_length(coalesce(garage_name, '')) <= 200);
alter table public.deferred_items
  add constraint deferred_reason_len check (char_length(coalesce(reason, '')) <= 1000);
alter table public.alerts
  add constraint alerts_json_size check (octet_length(basis::text) <= 65536);

-- Per-account document quota: 500 documents and 1 GiB of declared original bytes.
create or replace function public.tg_documents_quota()
returns trigger language plpgsql set search_path = '' as $$
declare
  n bigint;
  total bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('documents_quota:' || new.owner_id::text, 0));
  select count(*), coalesce(sum(d.size_bytes), 0) into n, total
    from public.documents d where d.owner_id = new.owner_id;
  if n >= 500 then
    raise exception 'document quota reached (500 documents)' using errcode = '23514';
  end if;
  if total + new.size_bytes > 1073741824 then
    raise exception 'storage quota reached (1 GiB)' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.tg_documents_quota() from public, anon;
create trigger documents_quota before insert on public.documents
  for each row execute function public.tg_documents_quota();

-- ---------- 7. storage: one object per owned document, insert-only ----------
create or replace function public.can_upload_document_object(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  -- Exactly {owner}/{vehicle}/{document}, and the document row (synced first) is the caller's.
  select array_length(storage.foldername(p_name), 1) = 2
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and exists (
       select 1 from public.documents d
        where d.owner_id = (select auth.uid())
          and d.vehicle_id::text = (storage.foldername(p_name))[2]
          and d.id::text = storage.filename(p_name)
     );
$$;
revoke all on function public.can_upload_document_object(text) from public, anon;
grant execute on function public.can_upload_document_object(text) to authenticated;

drop policy documents_insert on storage.objects;
drop policy documents_update on storage.objects;
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_upload_document_object(name));
-- No update policy: an original, once stored, is never overwritten.

-- ---------- 8. operator report (service role only) ----------
create or replace function public.storage_usage_report()
returns table (
  owner_id uuid,
  documents bigint,
  declared_bytes bigint,
  objects bigint,
  actual_bytes bigint,
  objects_without_document bigint,
  objects_larger_than_declared bigint
)
language sql stable security invoker set search_path = '' as $$
  with o as (
    select (storage.foldername(so.name))[1] as owner,
           storage.filename(so.name) as doc,
           (so.metadata->>'size')::bigint as size
      from storage.objects so where so.bucket_id = 'documents'
  ),
  d as (select dd.owner_id, dd.id, dd.size_bytes from public.documents dd),
  j as (
    select coalesce(d.owner_id::text, o.owner) as owner, d.id as doc_id, d.size_bytes,
           o.doc as obj, o.size
      from d full join o on o.doc = d.id::text and o.owner = d.owner_id::text
  )
  select j.owner::uuid,
         count(j.doc_id),
         coalesce(sum(j.size_bytes), 0)::bigint,
         count(j.obj),
         coalesce(sum(j.size), 0)::bigint,
         count(*) filter (where j.obj is not null and j.doc_id is null),
         count(*) filter (where j.size > j.size_bytes)
    from j
   where j.owner ~ '^[0-9a-f-]{36}$'
   group by j.owner;
$$;
revoke all on function public.storage_usage_report() from public, anon, authenticated;
grant execute on function public.storage_usage_report() to service_role;
