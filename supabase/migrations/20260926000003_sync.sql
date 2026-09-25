-- M09: sync protocol server side (ADR-0011).
-- sync_push applies client ops idempotently (op_id ledger) with optimistic concurrency:
--   * append-only entities: insert if absent, otherwise 'duplicate' (both sides' records are kept)
--   * mutable entities: compare-and-set on version; mismatch → 'conflict' + current server row
--   * delete (vehicles only): owner-checked delete (cascade) + tombstone for other devices
-- SECURITY INVOKER: RLS and composite ownership FKs apply to every statement.

-- A profile is a DEVICE identity (ADR-0010/0011): one account may be used on several devices.
alter table public.profiles drop constraint profiles_owner_id_key;

create table public.sync_applied_ops (
  op_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  applied_at timestamptz not null default now()
);

create table public.sync_tombstones (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  deleted_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (owner_id, entity_table, entity_id)
);

do $$
declare t text;
begin
  foreach t in array array['sync_applied_ops', 'sync_tombstones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, delete on public.%I to authenticated', t);
    execute format('create policy owner_all on public.%I for all to authenticated
                    using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

create or replace function public.sync_push(p_ops jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  op jsonb;
  t text;
  v_op_id uuid;
  payload jsonb;
  base integer;
  cols text;
  n integer;
  server_row jsonb;
  results jsonb := '[]'::jsonb;
  append_only text[] := array['odometer_readings','documents','extractions','schedules',
    'service_events','service_actions','service_event_documents','garage_recommendations'];
  mutable text[] := array['profiles','vehicles','deferred_items','alerts'];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    v_op_id := (op->>'op_id')::uuid;
    t := op->>'table';
    payload := op->'row';
    base := coalesce((op->>'base_version')::integer, 0);

    if exists (select 1 from public.sync_applied_ops a where a.op_id = v_op_id) then
      results := results || jsonb_build_object('op_id', v_op_id, 'status', 'duplicate');
      continue;
    end if;

    if not (t = any(append_only) or t = any(mutable)) then
      raise exception 'table % is not synced', t using errcode = '22023';
    end if;

    if op->>'op' = 'delete' then
      if t <> 'vehicles' then
        raise exception 'delete is only supported for vehicles' using errcode = '22023';
      end if;
      delete from public.vehicles v where v.id = (op->>'entity_id')::uuid and v.owner_id = auth.uid();
      insert into public.sync_tombstones (entity_table, entity_id)
        values ('vehicles', (op->>'entity_id')::uuid)
        on conflict (owner_id, entity_table, entity_id) do update set deleted_at = now(), server_updated_at = now();
      insert into public.sync_applied_ops (op_id) values (v_op_id);
      results := results || jsonb_build_object('op_id', v_op_id, 'status', 'applied');
      continue;
    end if;

    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
      into cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t
       and c.column_name not in ('owner_id', 'server_updated_at');

    -- Insert if absent (both kinds).
    execute format(
      'insert into public.%1$I (owner_id, %2$s)
         select (select auth.uid()), %2$s from jsonb_populate_record(null::public.%1$I, $1)
       on conflict do nothing', t, cols)
      using payload;
    get diagnostics n = row_count;

    if n = 1 then
      insert into public.sync_applied_ops (op_id) values (v_op_id);
      results := results || jsonb_build_object('op_id', v_op_id, 'status', 'applied');
    elsif t = any(append_only) then
      -- Already present: append-only records are immutable, both devices keep the same record.
      insert into public.sync_applied_ops (op_id) values (v_op_id);
      results := results || jsonb_build_object('op_id', v_op_id, 'status', 'duplicate');
    else
      -- Mutable: compare-and-set on the version the client started from.
      execute format(
        'update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1))
          where t.id = ($1->>''id'')::uuid and t.version = $2', t, cols)
        using payload, base;
      get diagnostics n = row_count;
      if n = 1 then
        insert into public.sync_applied_ops (op_id) values (v_op_id);
        results := results || jsonb_build_object('op_id', v_op_id, 'status', 'applied');
      else
        execute format('select to_jsonb(t) from public.%I t where t.id = ($1->>''id'')::uuid', t)
          into server_row using payload;
        results := results || jsonb_build_object(
          'op_id', v_op_id,
          'status', case when server_row is null then 'rejected' else 'conflict' end,
          'server_row', server_row);
      end if;
    end if;
  end loop;
  return results;
end $$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
