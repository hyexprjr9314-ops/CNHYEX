begin;

-- Align existing draft assignments with the directional mechanic gate used by
-- automatic and manual matching. Submitted and non-draft history is immutable.
with profiles as (
  select
    id,
    company,
    dept,
    workplace,
    type::text = '정비사' as is_mechanic,
    (coalesce(workplace, '') || ' ' || coalesce(dept, '')) like '%영업소%' as is_branch,
    (coalesce(dept, '') || ' ' || coalesce(workplace, '')) ~ '(차량|안전)' as is_vehicle_safety,
    coalesce(
      nullif(
        nullif(replace(regexp_replace(coalesce(workplace, ''), '[[:space:]ㆍ·._-]+', '', 'g'), '영업소', ''), ''),
        '본사'
      ),
      replace(regexp_replace(coalesce(dept, ''), '[[:space:]ㆍ·._-]+', '', 'g'), '영업소', '')
    ) as branch_key
  from public.users
), invalid_draft_pairs as (
  select matching.id
  from public.matchings matching
  join public.evaluation_cycles cycle on cycle.id = matching.cycle_id
  join profiles evaluator on evaluator.id = matching.evaluator_id
  join profiles target on target.id = matching.target_id
  where cycle.status::text in ('초안', 'draft', 'not_started')
    and not exists (
      select 1 from public.evaluations evaluation where evaluation.matching_id = matching.id
    )
    and (evaluator.is_mechanic or target.is_mechanic)
    and not case
      when evaluator.is_mechanic and target.is_mechanic then
        trim(evaluator.company::text) = trim(target.company::text)
        and trim(coalesce(evaluator.dept, '')) = trim(coalesce(target.dept, ''))
      when (evaluator.is_mechanic and target.is_branch)
        or (evaluator.is_branch and target.is_mechanic) then
        trim(evaluator.company::text) = trim(target.company::text)
        and evaluator.is_branch and target.is_branch
        and evaluator.branch_key <> ''
        and evaluator.branch_key = target.branch_key
      when evaluator.is_vehicle_safety and target.is_mechanic then
        trim(evaluator.company::text) = trim(target.company::text)
      when evaluator.is_mechanic or target.is_mechanic then false
      else true
    end
)
delete from public.matchings matching
using invalid_draft_pairs invalid
where matching.id = invalid.id;

commit;
