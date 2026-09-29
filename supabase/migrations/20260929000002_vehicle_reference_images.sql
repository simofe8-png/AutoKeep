-- Approved vehicle MODEL reference images (owner decisions 2026-09-29).
--
-- * One row per approved image for a vehicle identity CLASS (class_key: make/model/generation/
--   phase/body/color family). No plate, VIN or user identity is ever involved.
-- * The complete provenance / rights record lives here, independently of the cached binary, so
--   the rights evidence is never lost even if the image file is replaced or removed.
-- * Readable by the app (anon + authenticated, approved rows only). Writable ONLY by the
--   operator tool with the service role (no insert/update/delete policies).
create table public.vehicle_reference_images (
  id text primary key check (id ~ '^[a-z0-9_]{3,80}$'),
  class_key text not null check (class_key ~ '^v1(/[a-z0-9-]+){6}$'),
  status text not null check (status in ('approved', 'withdrawn')),
  storage_path text not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  label text not null,
  credit text not null,
  source_url text not null,
  license text not null,
  license_url text not null,
  author text not null,
  modification_notice text,
  -- Full record: applicability, source (original hash, retrieval time, metadata snapshot),
  -- rights (license flags, verification), derivative (operations, tool), review.
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_reference_images_class_idx
  on public.vehicle_reference_images (class_key) where status = 'approved';

alter table public.vehicle_reference_images enable row level security;

revoke all on public.vehicle_reference_images from public, anon, authenticated;
grant select on public.vehicle_reference_images to anon, authenticated;

create policy vehicle_reference_images_read_approved on public.vehicle_reference_images
  for select to anon, authenticated using (status = 'approved');

-- Public bucket for the approved (licensed) reference binaries only. Reading needs no account;
-- there are deliberately NO storage policies, so only the service role can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-references', 'vehicle-references', true, 5242880, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do nothing;
