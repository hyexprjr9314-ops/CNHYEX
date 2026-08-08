begin;

-- Remove only invalid, unsubmitted cross-company mechanic pairs from drafts.
-- Historical and submitted evaluations remain untouched.
with mechanic_profiles as (
  select id, company
  from public.users
  where type::text = '정비사'
     or (
       type::text = '팀원급'
       and (coalesce(role, '') like '%정비%' or trim(coalesce(dept, '')) in ('정비', '정비팀'))
     )
), invalid_draft_pairs as (
  select matching.id
  from public.matchings matching
  join public.evaluation_cycles cycle on cycle.id = matching.cycle_id
  join mechanic_profiles evaluator on evaluator.id = matching.evaluator_id
  join mechanic_profiles target on target.id = matching.target_id
  where cycle.status::text in ('초안', 'draft', 'not_started')
    and trim(evaluator.company::text) <> trim(target.company::text)
    and not exists (select 1 from public.evaluations evaluation where evaluation.matching_id = matching.id)
)
delete from public.matchings matching
using invalid_draft_pairs invalid
where matching.id = invalid.id;

-- The imported maintenance roster used the legacy generic team-member type.
-- Correct it so matching, question routing and grading all share one source.
update public.users
set type = '정비사', updated_at = now()
where type::text = '팀원급'
  and (coalesce(role, '') like '%정비%' or trim(coalesce(dept, '')) in ('정비', '정비팀'));

commit;
