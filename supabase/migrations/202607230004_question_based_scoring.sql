begin;

alter table public.evaluations
  add column if not exists scoring_method text not null default 'legacy_slider',
  add column if not exists scoring_version smallint not null default 1;

create or replace function public.submit_evaluation_central(
  p_matching_id bigint, p_perf_score numeric, p_collab_score numeric,
  p_growth_score numeric, p_harmony_score numeric, p_comment text, p_answers jsonb
)
returns bigint language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_evaluation_id bigint;
  v_cycle_id bigint;
  v_evaluator_id bigint;
  v_target_id bigint;
  v_target_track text;
  v_target_dept text;
  v_perf_score numeric;
  v_collab_score numeric;
  v_growth_score numeric;
  v_harmony_score numeric;
  v_category text;
begin
  -- The four legacy score parameters are intentionally ignored. Keeping the
  -- signature makes rollout backward-compatible while the server becomes the
  -- single authority for score calculation.
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Answers must be a JSON array';
  end if;
  if length(trim(coalesce(p_comment, ''))) < 50 then
    raise exception 'Comment must contain at least 50 characters';
  end if;

  select m.cycle_id, m.evaluator_id, m.target_id,
         case
           when target.dept like '%정비%' then '정비사'
           when target.type::text = '팀장급' or target.role like '%팀장%' or target.role like '%부장%' then '팀장/부서장급'
           when target.workplace like '%영업소%' or target.dept like '%영업소%' then '영업소'
           else '본사 팀원급'
         end,
         target.dept
    into v_cycle_id, v_evaluator_id, v_target_id, v_target_track, v_target_dept
  from public.matchings m
  join public.evaluation_cycles c on c.id = m.cycle_id
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  where m.id = p_matching_id
    and evaluator.auth_user_id = auth.uid()
    and evaluator.active is true and evaluator.can_evaluate is true
    and target.active is true and target.is_evaluatee is true
    and current_date between c.start_date and c.deadline
    and c.status = '진행중';

  if v_cycle_id is null then
    raise exception 'The evaluation is not assigned, enabled, or open';
  end if;

  if (
    select count(*) <> count(distinct answer.question_id)
    from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
  ) then
    raise exception 'Duplicate question answers are not allowed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
    left join public.evaluation_questions q on q.id = answer.question_id
      and q.cycle_id = v_cycle_id
      and coalesce(q.type, '') <> '서술형'
      and (q.target_track = '기본 필수질문' or q.target_track = v_target_track)
      and (q.target_dept is null or q.target_dept = '전체' or v_target_dept like '%' || q.target_dept || '%')
    where q.id is null or answer.score is null or answer.score < 1 or answer.score > 5
  ) then
    raise exception 'An answer is invalid or does not belong to this evaluation';
  end if;

  if exists (
    select 1
    from public.evaluation_questions q
    where q.cycle_id = v_cycle_id
      and coalesce(q.type, '') <> '서술형'
      and (q.target_track = '기본 필수질문' or q.target_track = v_target_track)
      and (q.target_dept is null or q.target_dept = '전체' or v_target_dept like '%' || q.target_dept || '%')
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
        where answer.question_id = q.id and answer.score between 1 and 5
      )
  ) then
    raise exception 'Every multiple-choice evaluation question must be answered';
  end if;

  foreach v_category in array array['성과','협업','성장','조화'] loop
    if not exists (
      select 1 from public.evaluation_questions q
      where q.cycle_id = v_cycle_id and q.category = v_category
        and coalesce(q.type, '') <> '서술형'
        and coalesce(q.weight, 0) > 0 and coalesce(q.max_score, 0) > 0
        and (q.target_track = '기본 필수질문' or q.target_track = v_target_track)
        and (q.target_dept is null or q.target_dept = '전체' or v_target_dept like '%' || q.target_dept || '%')
    ) then
      raise exception 'Category % needs at least one positively weighted multiple-choice question', v_category;
    end if;
  end loop;

  select
    round(sum((answer.score / q.max_score * 100) * q.weight) filter (where q.category = '성과')
      / nullif(sum(q.weight) filter (where q.category = '성과'), 0), 2),
    round(sum((answer.score / q.max_score * 100) * q.weight) filter (where q.category = '협업')
      / nullif(sum(q.weight) filter (where q.category = '협업'), 0), 2),
    round(sum((answer.score / q.max_score * 100) * q.weight) filter (where q.category = '성장')
      / nullif(sum(q.weight) filter (where q.category = '성장'), 0), 2),
    round(sum((answer.score / q.max_score * 100) * q.weight) filter (where q.category = '조화')
      / nullif(sum(q.weight) filter (where q.category = '조화'), 0), 2)
    into v_perf_score, v_collab_score, v_growth_score, v_harmony_score
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
  join public.evaluation_questions q on q.id = answer.question_id
  where q.cycle_id = v_cycle_id and coalesce(q.type, '') <> '서술형'
    and q.weight > 0 and q.max_score > 0
    and (q.target_track = '기본 필수질문' or q.target_track = v_target_track)
    and (q.target_dept is null or q.target_dept = '전체' or v_target_dept like '%' || q.target_dept || '%');

  insert into public.evaluations (
    matching_id, cycle_id, evaluator_id, target_id, perf_score, collab_score,
    growth_score, harmony_score, qualitative_comment, scoring_method, scoring_version
  ) values (
    p_matching_id, v_cycle_id, v_evaluator_id, v_target_id, v_perf_score, v_collab_score,
    v_growth_score, v_harmony_score, trim(p_comment), 'question_weighted', 2
  )
  on conflict (matching_id) do update set
    perf_score = excluded.perf_score, collab_score = excluded.collab_score,
    growth_score = excluded.growth_score, harmony_score = excluded.harmony_score,
    qualitative_comment = excluded.qualitative_comment,
    scoring_method = excluded.scoring_method, scoring_version = excluded.scoring_version
  returning id into v_evaluation_id;

  delete from public.evaluation_answers where evaluation_id = v_evaluation_id;
  insert into public.evaluation_answers (evaluation_id, matching_id, question_id, score)
  select v_evaluation_id, p_matching_id, answer.question_id, answer.score
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
  join public.evaluation_questions q on q.id = answer.question_id
  where q.cycle_id = v_cycle_id and coalesce(q.type, '') <> '서술형'
    and (q.target_track = '기본 필수질문' or q.target_track = v_target_track)
    and (q.target_dept is null or q.target_dept = '전체' or v_target_dept like '%' || q.target_dept || '%');

  -- Any prior coaching report is stale as soon as source answers change.
  delete from public.ai_evaluation_reports
  where cycle_id = v_cycle_id and target_id = v_target_id;

  return v_evaluation_id;
end $$;

revoke all on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb) from public;
grant execute on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

commit;
