begin;

-- Branch team members now use the same four scoring axes as headquarters
-- team members because their permitted assignments are affiliate peers.
create or replace function public.canonical_category_names_for_track(p_track text)
returns text[] language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  if p_track in ('headquarters_member', 'branch_employee') then
    return array['성과', '협업', '성장', '조화'];
  elsif p_track = 'headquarters_leader' then
    return array['리더십', '팀원 육성', '소통', '전략적 사고'];
  elsif p_track = 'mechanic' then
    return array['역량 개발', '정비 능력', '책임/주인의식', '안전의식'];
  end if;
  raise exception 'Unknown question track: %', coalesce(p_track, '(null)');
end $$;

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
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) target_track,
      case
        when trim(coalesce(evaluator.type::text, '')) = '팀원급'
         and trim(coalesce(target.type::text, '')) = '팀원급'
         and trim(coalesce(evaluator.company::text, '')) <> ''
         and trim(coalesce(target.company::text, '')) <> ''
         and trim(evaluator.company::text) <> trim(target.company::text)
        then 'affiliate_peer' else 'all'
      end question_audience
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
  where coalesce(question.audience, 'all') = assignment.question_audience
    and case when assignment.question_audience = 'affiliate_peer'
      then public.canonical_question_track_alias(question.target_track) in ('all', 'headquarters_member')
      else public.question_track_applies(question.target_track, assignment.target_track)
    end
  order by question.id
$$;

create or replace function public.validate_cycle_question_coverage(p_cycle_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  with assignments as (
    select distinct
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) target_track,
      case
        when trim(coalesce(evaluator.type::text, '')) = '팀원급'
         and trim(coalesce(target.type::text, '')) = '팀원급'
         and trim(coalesce(evaluator.company::text, '')) <> ''
         and trim(coalesce(target.company::text, '')) <> ''
         and trim(evaluator.company::text) <> trim(target.company::text)
        then 'affiliate_peer' else 'all'
      end question_audience
    from public.matchings matching
    join public.users evaluator on evaluator.id = matching.evaluator_id
    join public.users target on target.id = matching.target_id
    where matching.cycle_id = p_cycle_id
      and evaluator.active is true and evaluator.can_evaluate is true
      and target.active is true and target.is_evaluatee is true
      and target.type::text not in ('임원급', '임원')
  ), required_categories as (
    select assignment.target_track, assignment.question_audience, unnest(
      case when assignment.question_audience = 'affiliate_peer' then array['성과','협업','성장','조화']
      else case assignment.target_track
        when 'headquarters_member' then array['성과','협업','성장','조화']
        when 'headquarters_leader' then array['리더십','팀원 육성','소통','전략적 사고']
        when 'branch_employee' then array['성과','협업','성장','조화']
        when 'mechanic' then array['역량 개발','정비 능력','책임/주인의식','안전의식']
      end end
    ) category
    from assignments assignment
  ), missing as (
    select required.* from required_categories required
    where not exists (
      select 1 from public.evaluation_questions question
      where question.cycle_id = p_cycle_id
        and question.category = required.category
        and coalesce(question.type, '') <> '서술형'
        and coalesce(question.weight, 0) > 0
        and coalesce(question.max_score, 0) > 0
        and coalesce(question.audience, 'all') = required.question_audience
        and case when required.question_audience = 'affiliate_peer'
          then public.canonical_question_track_alias(question.target_track) in ('all', 'headquarters_member')
          else public.question_track_applies(question.target_track, required.target_track)
        end
    )
  ), issues as (
    select 'QUESTION_COVERAGE_MISSING' code, target_track, category,
      format('%s / %s: %s 질문이 없습니다.', target_track,
        case question_audience when 'affiliate_peer' then '계열사 팀원 간 평가' else '일반 평가' end, category) message
    from missing
    union all
    select distinct 'EXECUTIVE_TARGET_ASSIGNED', 'executive', null::text,
      '임원급 인원은 직접 평가 대상에 포함할 수 없습니다.'
    from public.matchings matching
    join public.users target on target.id = matching.target_id
    where matching.cycle_id = p_cycle_id and target.type::text in ('임원급', '임원')
  )
  select jsonb_build_object(
    'ok', not exists(select 1 from issues),
    'issues', coalesce(jsonb_agg(jsonb_build_object(
      'code', code, 'target_track', target_track, 'category', category, 'message', message
    )), '[]'::jsonb)
  ) from issues
$$;

create or replace function public.submit_evaluation_central(
  p_matching_id bigint, p_perf_score numeric, p_collab_score numeric,
  p_growth_score numeric, p_harmony_score numeric, p_comment text, p_answers jsonb
)
returns bigint language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_evaluation_id bigint; v_cycle_id bigint; v_evaluator_id bigint; v_target_id bigint;
  v_target_track text; v_question_audience text; v_categories text[]; v_scores numeric[];
begin
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then raise exception 'Answers must be a JSON array'; end if;
  if length(trim(coalesce(p_comment, ''))) < 50 then raise exception 'Comment must contain at least 50 characters'; end if;

  select m.cycle_id, m.evaluator_id, m.target_id,
    public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace),
    case when trim(coalesce(evaluator.type::text, '')) = '팀원급'
      and trim(coalesce(target.type::text, '')) = '팀원급'
      and trim(coalesce(evaluator.company::text, '')) <> ''
      and trim(coalesce(target.company::text, '')) <> ''
      and trim(evaluator.company::text) <> trim(target.company::text)
      then 'affiliate_peer' else 'all' end
    into v_cycle_id, v_evaluator_id, v_target_id, v_target_track, v_question_audience
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  where m.id = p_matching_id and evaluator.auth_user_id = auth.uid()
    and evaluator.active is true and evaluator.can_evaluate is true
    and target.active is true and target.is_evaluatee is true;
  if v_cycle_id is null then raise exception 'The evaluation is not assigned or enabled'; end if;

  perform 1 from public.evaluation_cycles c where c.id = v_cycle_id
    and current_date between c.start_date and c.deadline and c.status = '진행중' for update;
  if not found then raise exception 'The evaluation cycle is not open'; end if;

  v_categories := case when v_question_audience = 'affiliate_peer'
    then array['성과','협업','성장','조화']
    else public.canonical_category_names_for_track(v_target_track) end;
  if exists (select 1 from unnest(v_categories) category_name where not exists (
    select 1 from public.my_assigned_questions(p_matching_id) q where q.category = category_name
      and coalesce(q.type, '') <> '서술형' and coalesce(q.weight, 0) > 0 and coalesce(q.max_score, 0) > 0
  )) then raise exception 'Each configured track category needs a positively weighted multiple-choice question'; end if;
  if (select count(*) <> count(distinct answer.question_id)
    from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) answer(question_id bigint, score numeric))
    then raise exception 'Duplicate question answers are not allowed'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) answer(question_id bigint, score numeric)
    left join public.my_assigned_questions(p_matching_id) q on q.id = answer.question_id and coalesce(q.type, '') <> '서술형'
    where q.id is null or answer.score is null or answer.score < 1 or answer.score > 5)
    then raise exception 'An answer is invalid or does not belong to this evaluation'; end if;
  if exists (select 1 from public.my_assigned_questions(p_matching_id) q
    where coalesce(q.type, '') <> '서술형' and q.required is true and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) answer(question_id bigint, score numeric)
      where answer.question_id = q.id and answer.score between 1 and 5
    )) then raise exception 'Every required multiple-choice evaluation question must be answered'; end if;

  select array_agg(coalesce(category_score, 0) order by category_order) into v_scores from (
    select category_order, round(sum((answer.score / q.max_score * 100) * q.weight) / nullif(sum(q.weight), 0), 2) category_score
    from unnest(v_categories) with ordinality category(category_name, category_order)
    left join public.my_assigned_questions(p_matching_id) q on q.category = category.category_name and coalesce(q.type, '') <> '서술형'
    left join jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) answer(question_id bigint, score numeric) on answer.question_id = q.id
    group by category_order
  ) category_scores;
  insert into public.evaluations (matching_id,cycle_id,evaluator_id,target_id,perf_score,collab_score,growth_score,harmony_score,qualitative_comment,scoring_method,scoring_version)
  values (p_matching_id,v_cycle_id,v_evaluator_id,v_target_id,v_scores[1],v_scores[2],v_scores[3],v_scores[4],trim(p_comment),'question_weighted',4)
  on conflict (matching_id) do update set perf_score=excluded.perf_score,collab_score=excluded.collab_score,
    growth_score=excluded.growth_score,harmony_score=excluded.harmony_score,qualitative_comment=excluded.qualitative_comment,
    scoring_method=excluded.scoring_method,scoring_version=excluded.scoring_version returning id into v_evaluation_id;
  delete from public.evaluation_answers where evaluation_id = v_evaluation_id;
  insert into public.evaluation_answers (evaluation_id,matching_id,question_id,score)
  select v_evaluation_id,p_matching_id,answer.question_id,answer.score
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) answer(question_id bigint, score numeric)
  join public.my_assigned_questions(p_matching_id) q on q.id = answer.question_id where coalesce(q.type, '') <> '서술형';
  return v_evaluation_id;
end $$;

revoke all on function public.my_assigned_questions(bigint) from public, anon;
revoke all on function public.validate_cycle_question_coverage(bigint) from public, anon, authenticated;
revoke all on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb) from public, anon;
grant execute on function public.my_assigned_questions(bigint) to authenticated;
grant execute on function public.validate_cycle_question_coverage(bigint) to service_role;
grant execute on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

commit;
