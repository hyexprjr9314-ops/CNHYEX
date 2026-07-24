begin;

-- Retire the original slider-score entry point.  It predates server-side
-- question weighting, so leaving it callable would let an authenticated user
-- choose arbitrary component scores.
drop function if exists public.submit_evaluation(bigint,numeric,numeric,numeric,numeric,text);

-- Keep question-track classification separate from relative-grading cohorts.
-- Leadership wins first: a branch or maintenance leader receives leadership
-- questions, while final grade cohorts continue to use their existing logic.
create or replace function public.canonical_question_track_for_profile(
  p_employee_type text, p_role text, p_dept text, p_workplace text
)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_employee_type, '') in ('팀장급', '부서실장급', '임원급')
      or coalesce(p_role, '') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)'
      then 'headquarters_leader'
    when coalesce(p_dept, '') like '%정비%' then 'mechanic'
    when coalesce(p_workplace, '') like '%영업소%' or coalesce(p_dept, '') like '%영업소%'
      then 'branch_employee'
    else 'headquarters_member'
  end
$$;

-- Compatibility mapping for every UI label currently emitted by the browser,
-- plus canonical values already stored by newer clients.
create or replace function public.canonical_question_track_alias(p_track text)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case trim(coalesce(p_track, ''))
    when '' then 'all'
    when 'all' then 'all'
    when '기본 필수질문' then 'all'
    when '전사 공통' then 'all'
    when '본사 팀원급' then 'headquarters_member'
    when 'headquarters_member' then 'headquarters_member'
    when '팀장/부서장급' then 'headquarters_leader'
    when '팀장·부서장급' then 'headquarters_leader'
    when 'headquarters_leader' then 'headquarters_leader'
    when '영업소' then 'branch_employee'
    when '영업소 직원' then 'branch_employee'
    when 'branch_employee' then 'branch_employee'
    when '정비사' then 'mechanic'
    when 'mechanic' then 'mechanic'
    else lower(trim(p_track))
  end
$$;

create or replace function public.question_track_applies(p_question_track text, p_target_track text)
returns boolean language sql immutable set search_path = public, pg_temp
as $$
  select public.canonical_question_track_alias(p_question_track) = 'all'
      or public.canonical_question_track_alias(p_question_track) = p_target_track
$$;

-- A read-only helper intentionally documents the separate cohort decision.
-- Do not use it to select questions: the leadership-first helper above owns
-- that concern, whereas relative grading remains 본사/영업소/정비사.
create or replace function public.evaluation_cohort_key_for_profile(p_dept text, p_workplace text)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_dept, '') like '%정비%' then 'mechanic'
    when coalesce(p_dept, '') like '%영업소%' or coalesce(p_workplace, '') like '%영업소%' then 'branch'
    else 'headquarters'
  end
$$;

create or replace function public.my_assigned_questions(p_matching_id bigint)
returns table (
  id bigint, cycle_id bigint, category text, text text, weight numeric,
  type text, target_track text, target_dept text, audience text,
  required boolean, is_default boolean, max_score numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with assignment as (
    select m.cycle_id, coalesce(m.relationship_type, 'internal') as relationship_type,
      target.dept as target_dept,
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) as target_track
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
    and public.question_track_applies(q.target_track, a.target_track)
    and (q.target_dept is null or q.target_dept = '전체' or a.target_dept like '%' || q.target_dept || '%')
  order by q.id
$$;

-- Central submission locks the cycle first.  Finalization obtains that same
-- row lock, preventing a last-minute submit from racing an immutable archive.
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
  v_categories text[];
  v_scores numeric[];
begin
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Answers must be a JSON array';
  end if;
  if length(trim(coalesce(p_comment, ''))) < 50 then
    raise exception 'Comment must contain at least 50 characters';
  end if;

  select m.cycle_id, m.evaluator_id, m.target_id,
         public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace)
    into v_cycle_id, v_evaluator_id, v_target_id, v_target_track
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  where m.id = p_matching_id and evaluator.auth_user_id = auth.uid()
    and evaluator.active is true and evaluator.can_evaluate is true
    and target.active is true and target.is_evaluatee is true;
  if v_cycle_id is null then raise exception 'The evaluation is not assigned or enabled'; end if;

  perform 1 from public.evaluation_cycles c
  where c.id = v_cycle_id and current_date between c.start_date and c.deadline
    and c.status = '진행중'
  for update;
  if not found then raise exception 'The evaluation cycle is not open'; end if;

  v_categories := case v_target_track
    when 'headquarters_member' then array['성과', '협업', '성장', '조화']
    when 'headquarters_leader' then array['리더십', '팀원 육성', '소통', '전략적 사고']
    when 'branch_employee' then array['비상대응', '소통 협력', '솔선 수범', '갈등 해소']
    when 'mechanic' then array['역량 개발', '정비 능력', '책임/주인의식', '안전의식']
    else raise exception 'Unknown question track'
  end;

  if exists (
    select 1 from unnest(v_categories) category_name
    where not exists (
      select 1 from public.my_assigned_questions(p_matching_id) q
      where q.category = category_name and coalesce(q.type, '') <> '서술형'
        and coalesce(q.weight, 0) > 0 and coalesce(q.max_score, 0) > 0
    )
  ) then
    raise exception 'Each configured track category needs a positively weighted multiple-choice question';
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
  ) then raise exception 'An answer is invalid or does not belong to this evaluation'; end if;
  if exists (
    select 1 from public.my_assigned_questions(p_matching_id) q
    where coalesce(q.type, '') <> '서술형' and q.required is true
      and not exists (
        select 1 from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as answer(question_id bigint, score numeric)
        where answer.question_id = q.id and answer.score between 1 and 5
      )
  ) then raise exception 'Every required multiple-choice evaluation question must be answered'; end if;

  select array_agg(coalesce(category_score, 0) order by category_order) into v_scores
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
    v_scores[1], v_scores[2], v_scores[3], v_scores[4], trim(p_comment), 'question_weighted', 4
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

-- Dynamic coverage has no legacy fixed-category fallback.  It validates every
-- real target/relationship scope using the same canonical aliases as submit.
create or replace function public.validate_cycle_question_coverage(p_cycle_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  with scopes as (
    select distinct m.target_id, coalesce(m.relationship_type, 'internal') relationship_type,
      public.canonical_question_track_for_profile(t.type::text, t.role, t.dept, t.workplace) target_track,
      coalesce(t.dept, '') target_dept
    from public.matchings m join public.users t on t.id=m.target_id
    where m.cycle_id=p_cycle_id and t.active is true and t.is_evaluatee is true
  ), required_categories as (
    select s.*, unnest(case s.target_track
      when 'headquarters_member' then array['성과','협업','성장','조화']
      when 'headquarters_leader' then array['리더십','팀원 육성','소통','전략적 사고']
      when 'branch_employee' then array['비상대응','소통 협력','솔선 수범','갈등 해소']
      when 'mechanic' then array['역량 개발','정비 능력','책임/주인의식','안전의식']
    end) category
    from scopes s
  ), missing as (
    select rc.* from required_categories rc where not exists (
      select 1 from public.evaluation_questions q
      where q.cycle_id=p_cycle_id and q.category=rc.category
        and coalesce(q.type,'') <> '서술형' and coalesce(q.weight,0)>0 and coalesce(q.max_score,0)>0
        and (coalesce(q.audience,'all')='all' or q.audience=rc.relationship_type)
        and public.question_track_applies(q.target_track, rc.target_track)
        and (q.target_dept is null or q.target_dept='전체' or rc.target_dept like '%' || q.target_dept || '%')
    )
  )
  select jsonb_build_object('ok',not exists(select 1 from missing),'issues',coalesce(jsonb_agg(jsonb_build_object(
    'code','QUESTION_COVERAGE_MISSING','target_id',target_id,'relationship_type',relationship_type,'target_track',target_track,'category',category,
    'message',format('%s/%s: %s 질문이 없습니다.',target_track,relationship_type,category)
  )),'[]'::jsonb)) from missing
$$;

-- Activation intentionally uses the dynamic scope validator only; the older
-- validator hard-coded 성과/협업/성장/조화 and is no longer an activation gate.
create or replace function public.activate_evaluation_cycle(p_cycle_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cycle public.evaluation_cycles; v_coverage jsonb; v_message text;
begin
  select * into v_cycle from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if v_cycle.status is distinct from '초안' then raise exception 'Only draft cycles can be activated'; end if;
  if v_cycle.end_date < v_cycle.start_date or v_cycle.deadline < v_cycle.end_date then
    raise exception 'Evaluation cycle dates are invalid';
  end if;
  if not exists (select 1 from public.matchings where cycle_id=p_cycle_id) then
    raise exception 'Evaluation cycle requires at least one matching';
  end if;
  v_coverage := public.validate_cycle_question_coverage(p_cycle_id);
  if coalesce((v_coverage->>'ok')::boolean,false) is not true then
    select string_agg(item->>'message', E'\n') into v_message from jsonb_array_elements(v_coverage->'issues') item;
    raise exception 'Evaluation cycle activation failed:%', E'\n' || coalesce(v_message,'Question coverage is invalid');
  end if;
  update public.evaluation_cycles set status='진행중',updated_at=now() where id=p_cycle_id;
  return jsonb_build_object('ok',true,'activated',true,'cycle_id',p_cycle_id,'question_coverage',v_coverage);
end $$;

-- Service-role API calls bypass RLS, so database triggers protect source data
-- after a cycle has left draft status.  This closes the finalize/edit race.
create or replace function public.prevent_non_draft_cycle_source_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cycle_id bigint;
begin
  v_cycle_id := coalesce(new.cycle_id, old.cycle_id);
  if exists (select 1 from public.evaluation_cycles c where c.id=v_cycle_id and c.status is distinct from '초안') then
    raise exception 'Questions and matchings are immutable once an evaluation cycle leaves draft';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists evaluation_questions_prevent_non_draft_mutation on public.evaluation_questions;
create trigger evaluation_questions_prevent_non_draft_mutation
before insert or update or delete on public.evaluation_questions
for each row execute function public.prevent_non_draft_cycle_source_mutation();
drop trigger if exists matchings_prevent_non_draft_mutation on public.matchings;
create trigger matchings_prevent_non_draft_mutation
before insert or update or delete on public.matchings
for each row execute function public.prevent_non_draft_cycle_source_mutation();

create or replace function public.prevent_weight_change_while_cycle_non_draft()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.evaluation_cycles where status is distinct from '초안') then
    raise exception 'Category weights are immutable while a non-draft evaluation cycle exists';
  end if;
  return new;
end $$;
drop trigger if exists evaluation_settings_prevent_weight_mutation on public.evaluation_settings;
create trigger evaluation_settings_prevent_weight_mutation
before update of performance_weight, collaboration_weight, growth_weight, harmony_weight on public.evaluation_settings
for each row execute function public.prevent_weight_change_while_cycle_non_draft();

-- Fail closed: no matching active profile is treated as privileged.  Avoid
-- NOT IN/NULL semantics, and reset ACLs explicitly for every exposed RPC.
create or replace function public.admin_list_users()
returns setof public.users language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if coalesce((select u.sys_role::text from public.users u where u.auth_user_id=auth.uid() and u.active is true limit 1), '') is distinct from '관리자' then
    raise exception 'Administrator access required';
  end if;
  return query select * from public.users order by id;
end $$;

create or replace function public.executive_list_users()
returns table(id bigint,name text,company text,dept text,workplace text,role text,employee_type text,can_evaluate boolean,is_evaluatee boolean,active boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if coalesce((select u.sys_role::text from public.users u where u.auth_user_id=auth.uid() and u.active is true limit 1), '') not in ('관리자','임원') then
    raise exception 'Privileged access required';
  end if;
  return query select u.id,u.name,u.company::text,u.dept,u.workplace,u.role,u.type::text,u.can_evaluate,u.is_evaluatee,u.active from public.users u order by u.id;
end $$;

create or replace function public.executive_cycle_governance_summary()
returns table(cycle_id bigint,cycle_name text,cycle_status text,result_version integer,approval_status text,results_published boolean,active_adjustment_count integer,stage2_adjustment_count integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if coalesce((select u.sys_role::text from public.users u where u.auth_user_id=auth.uid() and u.active is true limit 1), '') not in ('관리자','임원') then
    raise exception 'Privileged access required';
  end if;
  return query select c.id,c.name,c.status,c.result_version,c.internal_approval_status,c.results_published,
    count(a.id) filter(where a.status='active')::integer,
    count(a.id) filter(where a.status='active' and a.workflow_status='second_stage_adjusted')::integer
  from public.evaluation_cycles c left join public.evaluation_result_adjustments a on a.cycle_id=c.id
  group by c.id,c.name,c.status,c.result_version,c.internal_approval_status,c.results_published order by c.id desc;
end $$;

revoke all on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb), public.my_assigned_questions(bigint), public.activate_evaluation_cycle(bigint), public.validate_cycle_question_coverage(bigint), public.admin_list_users(), public.executive_list_users(), public.executive_cycle_governance_summary() from public, anon, authenticated;
grant execute on function public.submit_evaluation_central(bigint,numeric,numeric,numeric,numeric,text,jsonb), public.my_assigned_questions(bigint), public.executive_list_users(), public.executive_cycle_governance_summary() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.activate_evaluation_cycle(bigint) to service_role;
revoke all on function public.canonical_question_track_for_profile(text,text,text,text), public.canonical_question_track_alias(text), public.question_track_applies(text,text), public.evaluation_cohort_key_for_profile(text,text) from public;
grant execute on function public.canonical_question_track_for_profile(text,text,text,text), public.canonical_question_track_alias(text), public.question_track_applies(text,text), public.evaluation_cohort_key_for_profile(text,text) to authenticated, service_role;

commit;
