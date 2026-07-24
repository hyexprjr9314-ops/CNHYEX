begin;

create or replace function public.prevent_weight_change_while_cycle_non_draft()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.evaluation_cycles c
    where c.status <> '마감/보관됨'
      and (c.status is distinct from '초안' or c.internal_approval_status is distinct from 'not_requested')
  ) then
    raise exception 'Category weights are immutable while an active or approval-started evaluation cycle exists';
  end if;
  return new;
end $$;

create or replace function public.prevent_profile_classification_mutation_while_cycle_locked()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role
     and new.company is not distinct from old.company
     and new.dept is not distinct from old.dept
     and new.workplace is not distinct from old.workplace
     and new.type is not distinct from old.type
     and new.is_evaluatee is not distinct from old.is_evaluatee
     and new.can_evaluate is not distinct from old.can_evaluate then
    return new;
  end if;
  if exists (
    select 1 from public.matchings m
    join public.evaluation_cycles c on c.id = m.cycle_id
    where (m.evaluator_id = old.id or m.target_id = old.id)
      and c.status <> '마감/보관됨'
      and (c.status is distinct from '초안' or c.internal_approval_status is distinct from 'not_requested')
  ) then
    raise exception 'Profile classification is immutable while the employee is assigned to an active or approval-started evaluation cycle';
  end if;
  return new;
end $$;

commit;
