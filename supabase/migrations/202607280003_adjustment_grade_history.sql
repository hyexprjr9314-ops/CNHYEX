begin;

alter table public.evaluation_result_adjustment_events
  add column if not exists previous_grade text,
  add column if not exists next_grade text;

alter table public.evaluation_result_adjustment_events
  drop constraint if exists evaluation_result_adjustment_events_previous_grade_check,
  add constraint evaluation_result_adjustment_events_previous_grade_check
    check (previous_grade is null or previous_grade in ('EX','S','A','B','C','D')),
  drop constraint if exists evaluation_result_adjustment_events_next_grade_check,
  add constraint evaluation_result_adjustment_events_next_grade_check
    check (next_grade is null or next_grade in ('EX','S','A','B','C','D'));

create or replace function public.populate_adjustment_event_grades()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_grade text;
  v_current_grade text;
begin
  select event.next_grade
    into v_previous_grade
  from public.evaluation_result_adjustment_events event
  where event.cycle_id = new.cycle_id
    and event.target_id = new.target_id
  order by event.occurred_at desc, event.id desc
  limit 1;

  if v_previous_grade is null then
    select coalesce(result.approved_grade, result.relative_grade)
      into v_previous_grade
    from public.evaluation_final_results result
    join public.evaluation_cycles cycle on cycle.id = result.cycle_id
    where result.cycle_id = new.cycle_id
      and result.target_id = new.target_id
      and result.result_version = cycle.result_version
    limit 1;
  end if;

  select coalesce(adjustment.grade_override, adjustment.final_grade)
    into v_current_grade
  from public.evaluation_result_adjustments adjustment
  where adjustment.id = new.adjustment_id;

  new.previous_grade := coalesce(new.previous_grade, v_previous_grade);
  new.next_grade := coalesce(new.next_grade, v_current_grade, new.previous_grade);
  return new;
end $$;

drop trigger if exists populate_adjustment_event_grades_before_insert
  on public.evaluation_result_adjustment_events;
create trigger populate_adjustment_event_grades_before_insert
before insert on public.evaluation_result_adjustment_events
for each row execute function public.populate_adjustment_event_grades();

create or replace function public.sync_latest_adjustment_event_grade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.grade_override is not distinct from old.grade_override then
    return new;
  end if;

  update public.evaluation_result_adjustment_events
  set next_grade = coalesce(new.grade_override, new.final_grade, previous_grade)
  where id = (
    select event.id
    from public.evaluation_result_adjustment_events event
    where event.adjustment_id = new.id
    order by event.occurred_at desc, event.id desc
    limit 1
  );
  return new;
end $$;

drop trigger if exists sync_latest_adjustment_event_grade_after_update
  on public.evaluation_result_adjustments;
create trigger sync_latest_adjustment_event_grade_after_update
after update of grade_override on public.evaluation_result_adjustments
for each row execute function public.sync_latest_adjustment_event_grade();

-- Existing rows remain valid. Enrich the latest known event where the current
-- adjustment and immutable result already provide an unambiguous grade.
with latest_events as (
  select distinct on (event.cycle_id, event.target_id)
    event.id,
    coalesce(result.relative_grade, result.approved_grade) as previous_grade,
    coalesce(adjustment.grade_override, adjustment.final_grade,
             result.approved_grade, result.relative_grade) as next_grade
  from public.evaluation_result_adjustment_events event
  left join public.evaluation_result_adjustments adjustment
    on adjustment.id = event.adjustment_id
  left join public.evaluation_cycles cycle
    on cycle.id = event.cycle_id
  left join public.evaluation_final_results result
    on result.cycle_id = event.cycle_id
   and result.target_id = event.target_id
   and result.result_version = cycle.result_version
  order by event.cycle_id, event.target_id, event.occurred_at desc, event.id desc
)
update public.evaluation_result_adjustment_events event
set previous_grade = coalesce(event.previous_grade, latest.previous_grade),
    next_grade = coalesce(event.next_grade, latest.next_grade)
from latest_events latest
where event.id = latest.id;

commit;
