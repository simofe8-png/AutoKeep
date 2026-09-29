-- Vehicle exterior phase (owner decision 2026-09-29): which exterior of a generation the vehicle
-- has (e.g. pre-facelift / first facelift). Set only by a high-confidence registry rule or by the
-- user's own visual confirmation — never guessed. Used to pick a model reference image.
-- Replicated by sync / backup / restore like every other vehicle column.
alter table public.vehicles
  add column exterior_phase text,
  add column exterior_phase_source text;

alter table public.vehicles
  add constraint vehicles_exterior_phase_check check (
    (exterior_phase is null and exterior_phase_source is null)
    or (exterior_phase in ('pre-fl', 'fl1', 'fl2') and exterior_phase_source in ('registry', 'user')));
