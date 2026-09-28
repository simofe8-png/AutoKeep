-- Vehicle identity: color and engine code (owner request 2026-09-28).
-- Both optional: unknown stays NULL and is never inferred. The engine code is a first-class
-- identity attribute, distinct from the displacement (`engine`).
-- sync_push / adopt_local_data resolve columns from information_schema, so both columns are
-- replicated (backup, sync, restore on another device) without further changes.
alter table public.vehicles
  add column color text,
  add column engine_code text;

alter table public.vehicles
  add constraint vehicles_identity_extra_len check (
    coalesce(char_length(color), 0) <= 40 and coalesce(char_length(engine_code), 0) <= 20);
