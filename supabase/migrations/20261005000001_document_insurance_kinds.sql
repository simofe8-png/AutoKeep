-- Document kinds for insurance papers (owner decision 2026-10-05): compulsory (ביטוח חובה) and
-- comprehensive / third party (מקיף / צד ג׳). Widens the inline check of the initial schema.
-- Applying this to a hosted project is an owner approval gate.
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('owners_manual','maintenance_schedule','invoice','registration',
                  'insurance_compulsory','insurance_other','other'));
