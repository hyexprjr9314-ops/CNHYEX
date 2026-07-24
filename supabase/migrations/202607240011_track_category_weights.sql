begin;

alter table public.evaluation_settings
  add column if not exists track_category_weights jsonb not null default
  '{
    "headquarters_member":[40,30,20,10],
    "headquarters_leader":[35,25,25,15],
    "branch_employee":[30,30,20,20],
    "mechanic":[20,35,25,20]
  }'::jsonb;

create or replace function public.validate_track_category_weights()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare
  v_track text;
  v_values jsonb;
  v_sum numeric;
begin
  foreach v_track in array array['headquarters_member','headquarters_leader','branch_employee','mechanic']
  loop
    v_values := new.track_category_weights -> v_track;
    if jsonb_typeof(v_values) <> 'array' or jsonb_array_length(v_values) <> 4 then
      raise exception 'Every evaluation track requires four category weights';
    end if;
    select sum(value::numeric) into v_sum from jsonb_array_elements_text(v_values);
    if abs(v_sum - 100) > 0.01 then
      raise exception 'Every evaluation track category weight total must equal 100';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_validate_track_category_weights on public.evaluation_settings;
create trigger trg_validate_track_category_weights
before insert or update of track_category_weights on public.evaluation_settings
for each row execute function public.validate_track_category_weights();

create or replace function public.category_weight_for_target(
  p_weights jsonb,
  p_target_id bigint,
  p_position integer,
  p_fallback numeric
)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(p_weights -> public.canonical_question_track_for_profile(
      u.type::text, u.role, u.dept, u.workplace
    ) ->> (p_position - 1), '')::numeric,
    p_fallback
  )
  from public.users u
  where u.id = p_target_id
$$;

-- Keep the database-owned finalizer intact and replace only its four legacy
-- global-weight lookups. This preserves all locking, approval, audit, cohort,
-- snapshot, and immutable-result behavior from the current finalizer.
do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.governance_finalize_cycle(bigint,uuid)'::regprocedure)
    into v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition,
    'coalesce(v_settings.performance_weight, 40)',
    'public.category_weight_for_target(v_settings.track_category_weights, p.target_id, 1, coalesce(v_settings.performance_weight, 40))');
  v_definition := replace(v_definition,
    'coalesce(v_settings.collaboration_weight, 30)',
    'public.category_weight_for_target(v_settings.track_category_weights, p.target_id, 2, coalesce(v_settings.collaboration_weight, 30))');
  v_definition := replace(v_definition,
    'coalesce(v_settings.growth_weight, 20)',
    'public.category_weight_for_target(v_settings.track_category_weights, p.target_id, 3, coalesce(v_settings.growth_weight, 20))');
  v_definition := replace(v_definition,
    'coalesce(v_settings.harmony_weight, 10)',
    'public.category_weight_for_target(v_settings.track_category_weights, p.target_id, 4, coalesce(v_settings.harmony_weight, 10))');
  if v_definition = v_original then
    raise exception 'Current governance finalizer does not contain the expected weight expressions';
  end if;
  execute v_definition;
end $$;

revoke all on function public.category_weight_for_target(jsonb,bigint,integer,numeric) from public;
revoke all on function public.validate_track_category_weights() from public;

commit;
