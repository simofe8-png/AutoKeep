-- M08 T069: transactional adoption of device-local data into the signed-in account.
-- SECURITY INVOKER: every insert runs under the caller's RLS (owner_id = auth.uid()) and the
-- composite ownership FKs, so a bundle can never write into another user's data.
-- The whole bundle is one transaction (a function call is atomic): all rows or none.
-- Idempotent: ON CONFLICT DO NOTHING lets an interrupted adoption be retried safely.

create or replace function public.adopt_local_data(p_bundle jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  t text;
  cols text;
  inserted bigint;
  result jsonb := '{}'::jsonb;
  -- Parent tables first so foreign keys resolve inside the same transaction.
  tables text[] := array[
    'profiles','vehicles','odometer_readings','documents','extractions','schedules',
    'service_events','service_actions','service_event_documents','garage_recommendations',
    'deferred_items','alerts'
  ];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
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
