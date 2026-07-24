begin;

drop function if exists public.my_assigned_targets();

create or replace function public.my_assigned_targets()
returns table (
  matching_id bigint, cycle_id bigint, target_id bigint, name text, dept text,
  workplace text, role text, employee_type text, company text, relationship_type text, submitted boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.id, m.cycle_id, target.id, target.name, target.dept, target.workplace,
         target.role, target.type::text, target.company::text, m.relationship_type,
         exists (select 1 from public.evaluations e where e.matching_id = m.id)
  from public.matchings m join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id join public.evaluation_cycles c on c.id = m.cycle_id
  where evaluator.id = public.current_employee_id() and evaluator.active is true and evaluator.can_evaluate is true
    and target.active is true and target.is_evaluatee is true and current_date between c.start_date and c.deadline and c.status = '진행중'
$$;

revoke all on function public.my_assigned_targets() from public;
grant execute on function public.my_assigned_targets() to authenticated;
commit;
