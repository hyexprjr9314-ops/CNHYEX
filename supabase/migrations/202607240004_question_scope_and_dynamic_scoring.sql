begin;

-- The browser may render only questions supplied by this RPC.  The same scope
-- is repeated in submit_evaluation_central below, so a forged answer cannot
-- choose a different track or relationship audience.
create or replace function public.my_assigned_questions(p_matching_id bigint)
returns table (
  id bigint, cycle_id bigint, category text, text text, weight numeric,
  type text, target_track text, target_dept text, audience text,
  required boolean, is_default boolean, max_score numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with assignment as (
    select m.cycle_id, m.relationship_type, target.dept as target_dept,
      case
        when coalesce(target.dept, '') like '%정비%' then 'mechanic'
        when coalesce(target.workplace, '') like '%영업소%' or coalesce(target.dept, '') like '%영업소%' then 'branch_employee'
        when target.type::text in ('팀장급', '부서실장급', '임원급')
          or coalesce(target.role, '') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)' then 'headquarters_leader'
        else 'headquarters_member'
      end as target_track
    from public.matchings m
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    join public.evaluation_cycles c on c.id = m.cycle_id
    where m.id = p_matching_id
      and evaluator.auth_user_id = auth.uid()
      and evaluator.active is true and evaluator.can_evaluate is true
      and target.active is true and target.is_evaluatee is true
      and current_date between c.start_date and c.deadline and c.status = '진행중'
  )
  select q.id, q.cycle_id, q.category, q.text, q.weight, q.type,
         q.target_track, q.target_dept, q.audience, q.required, q.is_default, q.max_score
  from public.evaluation_questions q
  join assignment a on a.cycle_id = q.cycle_id
  where (coalesce(q.audience, 'all') = 'all' or q.audience = a.relationship_type)
    and (
      q.target_track is null or q.target_track in ('기본 필수질문', 'all', a.target_track)
      or (a.target_track = 'headquarters_member' and q.target_track = '본사 팀원급')
      or (a.target_track = 'headquarters_leader' and q.target_track = '팀장/부서장급')
      or (a.target_track = 'branch_employee' and q.target_track = '영업소')
      or (a.target_track = 'mechanic' and q.target_track = '정비사')
    )
    and (q.target_dept is null or q.target_dept = '전체' or a.target_dept like '%' || q.target_dept || '%')
  order by q.id;
$$;

revoke all on function public.my_assigned_questions(bigint) from public;
grant execute on function public.my_assigned_questions(bigint) to authenticated;

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
  v_relationship_type text;
  v_categories text[];
  v_legacy_categories text[] := array['성과', '협업', '성장', '조화'];
  v_has_track_categories boolean;
  v_has_legacy_categories boolean;
  v_scores numeric[];
begin
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Answers must be a JSON array';
  end if;
  if length(trim(coalesce(p_comment, ''))) < 50 then
    raise exception 'Comment must contain at least 50 characters';
  end if;

  select m.cycle_id, m.evaluator_id, m.target_id, m.relationship_type, target.dept,
    case
      when coalesce(target.dept, '') like '%정비%' then 'mechanic'
      when coalesce(target.workplace, '') like '%영업소%' or coalesce(target.dept, '') like '%영업소%' then 'branch_employee'
      when target.type::text in ('팀장급', '부서실장급', '임원급')
        or coalesce(target.role, '') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)' then 'headquarters_leader'
      else 'headquarters_member'
    end
  into v_cycle_id, v_evaluator_id, v_target_id, v_relationship_type, v_target_dept, v_target_track
  from public.matchings m
  join public.evaluation_cycles c on c.id = m.cycle_id
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  where m.id = p_matching_id and evaluator.auth_user_id = auth.uid()
    and evaluator.active is true and evaluator.can_evaluate is true
    and target.active is true and target.is_evaluatee is true
    and current_date between c.start_date and c.deadline and c.status = '진행중';

  if v_cycle_id is null then
    raise exception 'The evaluation is not assigned, enabled, or open';
  end if;

  v_categories := case v_target_track
    when 'headquarters_member' then array['성과', '협업', '성장', '조화']
    when 'headquarters_leader' then array['리더십', '팀원 육성', '소통', '전략적 사고']
    when 'branch_employee' then array['비상대응', '소통 협력', '솔선 수범', '갈등 해소']
    when 'mechanic' then array['역량 개발', '정비 능력', '책임/주인의식', '안전의식']
  end;

  select count(distinct q.category) = cardinality(v_categories)
  into v_has_track_categories
  from public.my_assigned_questions(p_matching_id) q
  where q.category = any(v_categories)
    and coalesce(q.type, '') <> '서술형'
    and coalesce(q.weight, 0) > 0
    and coalesce(q.max_score, 0) > 0;

  if not v_has_track_categories then
    select count(distinct q.category) = cardinality(v_legacy_categories)
    into v_has_legacy_categories
    from public.my_assigned_questions(p_matching_id) q
    where q.category = any(v_legacy_categories)
      and coalesce(q.type, '') <> '서술형'
      and coalesce(q.weight, 0) > 0
      and coalesce(q.max_score, 0) > 0;

    if v_has_legacy_categories then
      -- Compatibility path for cycles configured before track-specific categories.
      v_categories := v_legacy_categories;
    else
      raise exception 'All four track-specific categories, or all four legacy categories, need positively weighted multiple-choice questions';
    end if;
  end if;

  if (select count(*) <> count(distinct answer.question_id)
      from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)) then
    raise exception 'Duplicate question answers are not allowed';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
    left join public.my_assigned_questions(p_matching_id) q on q.id = answer.question_id
      and coalesce(q.type, '') <> '서술형'
    where q.id is null or answer.score is null or answer.score < 1 or answer.score > 5
  ) then
    raise exception 'An answer is invalid or does not belong to this evaluation';
  end if;

  if exists (
    select 1 from public.my_assigned_questions(p_matching_id) q
    where coalesce(q.type, '') <> '서술형' and q.required is true
      and not exists (
        select 1 from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
        where answer.question_id = q.id and answer.score between 1 and 5
      )
  ) then
    raise exception 'Every required multiple-choice evaluation question must be answered';
  end if;

  select array_agg(coalesce(category_score, 0) order by category_order)
  into v_scores
  from (
    select category_order,
      round(sum((answer.score / q.max_score * 100) * q.weight) / nullif(sum(q.weight), 0), 2) as category_score
    from unnest(v_categories) with ordinality as category(category_name, category_order)
    left join public.my_assigned_questions(p_matching_id) q
      on q.category = category.category_name and coalesce(q.type, '') <> '서술형'
    left join jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
      on answer.question_id = q.id
    group by category_order
  ) category_scores;

  insert into public.evaluations (
    matching_id, cycle_id, evaluator_id, target_id, perf_score, collab_score,
    growth_score, harmony_score, qualitative_comment, scoring_method, scoring_version
  ) values (
    p_matching_id, v_cycle_id, v_evaluator_id, v_target_id,
    v_scores[1], v_scores[2], v_scores[3], v_scores[4], trim(p_comment), 'question_weighted', 3
  ) on conflict (matching_id) do update set
    perf_score = excluded.perf_score, collab_score = excluded.collab_score,
    growth_score = excluded.growth_score, harmony_score = excluded.harmony_score,
    qualitative_comment = excluded.qualitative_comment,
    scoring_method = excluded.scoring_method, scoring_version = excluded.scoring_version
  returning id into v_evaluation_id;

  delete from public.evaluation_answers where evaluation_id = v_evaluation_id;
  insert into public.evaluation_answers (evaluation_id, matching_id, question_id, score)
  select v_evaluation_id, p_matching_id, answer.question_id, answer.score
  from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
  join public.my_assigned_questions(p_matching_id) q on q.id = answer.question_id
  where coalesce(q.type, '') <> '서술형';

  return v_evaluation_id;
end $$;

revoke all on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb) from public;
grant execute on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

commit;
