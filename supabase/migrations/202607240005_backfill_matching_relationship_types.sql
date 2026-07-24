begin;

-- Reconcile rows that existed before relationship_type was introduced.
-- The predicates intentionally mirror api/evaluation-classification.js.
with relationship_context as (
  select
    matching.id,
    coalesce(evaluator.dept, '') as evaluator_dept,
    coalesce(target.dept, '') as target_dept,
    (
      coalesce(evaluator.type::text, '') in ('팀장급', '부서실장급', '임원급')
      or coalesce(evaluator.role, '') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)'
    ) as evaluator_is_leader,
    (
      coalesce(target.type::text, '') in ('팀장급', '부서실장급', '임원급')
      or coalesce(target.role, '') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)'
    ) as target_is_leader
  from public.matchings as matching
  join public.users as evaluator on evaluator.id = matching.evaluator_id
  join public.users as target on target.id = matching.target_id
)
update public.matchings as matching
set relationship_type = case
  when context.evaluator_is_leader
    and context.target_is_leader
    and context.evaluator_dept <> context.target_dept then 'exchange'
  when context.target_is_leader then 'leadership'
  else 'internal'
end
from relationship_context as context
where matching.id = context.id;

commit;
