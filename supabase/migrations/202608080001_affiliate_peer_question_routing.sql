begin;

-- A dedicated question set is used only when both people are team members
-- and their non-empty company names differ. All other assignments keep the
-- existing general question set, including every leader evaluation.
create or replace function public.my_assigned_questions(p_matching_id bigint)
returns table (
  id bigint, cycle_id bigint, category text, text text, weight numeric,
  type text, target_track text, target_dept text, audience text,
  required boolean, is_default boolean, max_score numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with assignment as (
    select m.cycle_id,
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) as target_track,
      case
        when trim(coalesce(evaluator.type::text, '')) = '팀원급'
         and trim(coalesce(target.type::text, '')) = '팀원급'
         and trim(coalesce(evaluator.company, '')) <> ''
         and trim(coalesce(target.company, '')) <> ''
         and trim(evaluator.company) <> trim(target.company)
        then 'affiliate_peer'
        else 'all'
      end as question_audience
    from public.matchings m
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    join public.evaluation_cycles cycle on cycle.id = m.cycle_id
    where m.id = p_matching_id
      and evaluator.auth_user_id = auth.uid()
      and evaluator.active is true and evaluator.can_evaluate is true
      and target.active is true and target.is_evaluatee is true
      and target.type::text not in ('임원급', '임원')
      and current_date between cycle.start_date and cycle.deadline
      and cycle.status = '진행중'
  )
  select question.id, question.cycle_id, question.category, question.text,
         question.weight, question.type, question.target_track,
         question.target_dept, question.audience, question.required,
         question.is_default, question.max_score
  from public.evaluation_questions question
  join assignment on assignment.cycle_id = question.cycle_id
  where public.question_track_applies(question.target_track, assignment.target_track)
    and coalesce(question.audience, 'all') = assignment.question_audience
  order by question.id
$$;

-- Cycle activation checks exactly the same track + audience combinations
-- that evaluators will receive. This blocks an empty affiliate form before
-- the cycle can start.
create or replace function public.validate_cycle_question_coverage(p_cycle_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  with assignments as (
    select distinct
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) target_track,
      case
        when trim(coalesce(evaluator.type::text, '')) = '팀원급'
         and trim(coalesce(target.type::text, '')) = '팀원급'
         and trim(coalesce(evaluator.company, '')) <> ''
         and trim(coalesce(target.company, '')) <> ''
         and trim(evaluator.company) <> trim(target.company)
        then 'affiliate_peer'
        else 'all'
      end question_audience
    from public.matchings matching
    join public.users evaluator on evaluator.id = matching.evaluator_id
    join public.users target on target.id = matching.target_id
    where matching.cycle_id = p_cycle_id
      and evaluator.active is true and evaluator.can_evaluate is true
      and target.active is true and target.is_evaluatee is true
      and target.type::text not in ('임원급', '임원')
  ), required_categories as (
    select assignment.target_track, assignment.question_audience, unnest(case assignment.target_track
      when 'headquarters_member' then array['성과','협업','성장','조화']
      when 'headquarters_leader' then array['리더십','팀원 육성','소통','전략적 사고']
      when 'branch_employee' then array['비상대응','소통 협력','솔선 수범','갈등 해소']
      when 'mechanic' then array['역량 개발','정비 능력','책임/주인의식','안전의식']
    end) category
    from assignments assignment
  ), missing as (
    select required.*
    from required_categories required
    where not exists (
      select 1
      from public.evaluation_questions question
      where question.cycle_id = p_cycle_id
        and question.category = required.category
        and coalesce(question.type, '') <> '서술형'
        and coalesce(question.weight, 0) > 0
        and coalesce(question.max_score, 0) > 0
        and public.question_track_applies(question.target_track, required.target_track)
        and coalesce(question.audience, 'all') = required.question_audience
    )
  ), issues as (
    select
      'QUESTION_COVERAGE_MISSING' code,
      target_track,
      category,
      format('%s / %s: %s 질문이 없습니다.', target_track,
        case question_audience when 'affiliate_peer' then '계열사 팀원 간 평가' else '일반 평가' end,
        category) message
    from missing
    union all
    select distinct
      'EXECUTIVE_TARGET_ASSIGNED',
      'executive',
      null::text,
      '임원급 인원은 직접 평가 대상에 포함할 수 없습니다.'
    from public.matchings matching
    join public.users target on target.id = matching.target_id
    where matching.cycle_id = p_cycle_id
      and target.type::text in ('임원급', '임원')
  )
  select jsonb_build_object(
    'ok', not exists(select 1 from issues),
    'issues', coalesce(jsonb_agg(jsonb_build_object(
      'code', code,
      'target_track', target_track,
      'category', category,
      'message', message
    )), '[]'::jsonb)
  )
  from issues
$$;

revoke all on function public.my_assigned_questions(bigint) from public, anon;
revoke all on function public.validate_cycle_question_coverage(bigint) from public, anon, authenticated;
grant execute on function public.my_assigned_questions(bigint) to authenticated;
grant execute on function public.validate_cycle_question_coverage(bigint) to service_role;

commit;
