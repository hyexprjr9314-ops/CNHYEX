begin;

alter table public.evaluation_cycles
  add column if not exists auto_matching_enabled boolean not null default true;

comment on column public.evaluation_cycles.auto_matching_enabled is
  'Evaluation-cycle-specific matching mode. False means administrator-managed manual matching.';

commit;
