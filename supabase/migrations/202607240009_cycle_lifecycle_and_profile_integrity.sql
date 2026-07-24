begin;

-- Keep the track/category decision in one canonical, procedural helper.  The
-- prior migration attempted to use RAISE inside an expression CASE, which is
-- not valid PL/pgSQL.  All later callers use this function instead.
create or replace function public.canonical_category_names_for_track(p_track text)
returns text[] language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  if p_track = 'headquarters_member' then
    return array['성과', '협업', '성장', '조화'];
  elsif p_track = 'headquarters_leader' then
    return array['리더십', '팀원 육성', '소통', '전략적 사고'];
  elsif p_track = 'branch_employee' then
    return array['비상대응', '소통 협력', '솔선 수범', '갈등 해소'];
  elsif p_track = 'mechanic' then
    return array['역량 개발', '정비 능력', '책임/주인의식', '안전의식'];
  end if;
  raise exception 'Unknown question track: %', coalesce(p_track, '(null)');
end $$;

create or replace function public.canonical_category_labels_for_profile(
  p_employee_type text, p_role text, p_dept text, p_workplace text
)
returns jsonb language sql immutable set search_path = public, pg_temp
as $$
  select to_jsonb(public.canonical_category_names_for_track(
    public.canonical_question_track_for_profile(p_employee_type, p_role, p_dept, p_workplace)
  ))
$$;

-- Replaces the invalid expression CASE in 008 with a procedural helper call.
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

  v_categories := public.canonical_category_names_for_track(v_target_track);
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

-- Source rows cannot be moved between a frozen and a mutable cycle through an
-- UPDATE.  Check both old and new parent IDs, not merely coalesce(new, old).
create or replace function public.prevent_non_draft_cycle_source_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cycle_ids bigint[];
begin
  if tg_op = 'INSERT' then
    v_cycle_ids := array[new.cycle_id];
  elsif tg_op = 'DELETE' then
    v_cycle_ids := array[old.cycle_id];
  else
    v_cycle_ids := array[old.cycle_id, new.cycle_id];
  end if;
  if exists (
    select 1 from public.evaluation_cycles c
    where c.id = any(v_cycle_ids) and c.status is distinct from '초안'
  ) then
    raise exception 'Questions and matchings are immutable once an evaluation cycle leaves draft';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Match the API contract: a clean draft does not freeze global settings, but
-- active, paused, or approval-started cycles do.  Historical closed cycles do
-- not permanently prevent the next cycle from using revised weights.
create or replace function public.prevent_weight_change_while_cycle_non_draft()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.evaluation_cycles c
    where c.status not in ('마감/보관됨', 'closed')
      and (c.status is distinct from '초안' or c.internal_approval_status is distinct from 'not_requested')
  ) then
    raise exception 'Category weights are immutable while an active or approval-started evaluation cycle exists';
  end if;
  return new;
end $$;

-- The classification used for questions and relative-grade cohorts must not
-- drift while a person is attached to a live/frozen cycle.
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
    select 1
    from public.matchings m
    join public.evaluation_cycles c on c.id = m.cycle_id
    where (m.evaluator_id = old.id or m.target_id = old.id)
      and c.status not in ('마감/보관됨', 'closed')
      and (c.status is distinct from '초안' or c.internal_approval_status is distinct from 'not_requested')
  ) then
    raise exception 'Profile classification is immutable while the employee is assigned to an active or approval-started evaluation cycle';
  end if;
  return new;
end $$;

drop trigger if exists users_prevent_profile_classification_mutation on public.users;
create trigger users_prevent_profile_classification_mutation
before update of role, company, dept, workplace, type, is_evaluatee, can_evaluate on public.users
for each row execute function public.prevent_profile_classification_mutation_while_cycle_locked();

-- Cycle status transitions are server-owned.  A generic table update can edit
-- draft metadata, but cannot forge activation or finalization.
create or replace function public.prevent_direct_cycle_status_transition()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_transition text := current_setting('app.cycle_status_transition', true);
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status = '초안' and new.status = '진행중' and v_transition = 'activate' then return new; end if;
  if old.status is distinct from '마감/보관됨' and new.status = '마감/보관됨' and v_transition = 'finalize' then return new; end if;
  raise exception 'Evaluation cycle status transitions must use the dedicated governance RPC';
end $$;

drop trigger if exists evaluation_cycles_prevent_direct_status_transition on public.evaluation_cycles;
create trigger evaluation_cycles_prevent_direct_status_transition
before update of status on public.evaluation_cycles
for each row execute function public.prevent_direct_cycle_status_transition();

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
  perform set_config('app.cycle_status_transition', 'activate', true);
  update public.evaluation_cycles set status='진행중',updated_at=now() where id=p_cycle_id;
  return jsonb_build_object('ok',true,'activated',true,'cycle_id',p_cycle_id,'question_coverage',v_coverage);
end $$;

-- Recompute the final result entirely from locked source rows.  Category
-- labels deliberately come from the leadership-first canonical track helper;
-- the cohort key remains the separate work-area (본사/영업소/정비사) concept.
create or replace function public.governance_finalize_cycle(
  p_cycle_id bigint,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_version integer;
  v_archive_id bigint;
  v_settings public.evaluation_settings;
  v_target_count integer;
begin
  if public.governance_actor_role(p_actor_id) <> '관리자' then
    raise exception 'Administrator role required';
  end if;
  select * into v_cycle from public.evaluation_cycles where id = p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if v_cycle.status = '마감/보관됨'
     or exists (select 1 from public.evaluation_archives where cycle_id = p_cycle_id) then
    raise exception 'Cycle has already been finalized';
  end if;
  if v_cycle.internal_approval_status <> 'not_requested' then
    raise exception 'Cycle with approval activity cannot be finalized again';
  end if;

  perform 1 from public.matchings where cycle_id = p_cycle_id for update;
  perform 1 from public.evaluations where cycle_id = p_cycle_id for update;
  perform 1 from public.evaluation_result_adjustments where cycle_id = p_cycle_id for update;
  select * into v_settings from public.evaluation_settings where id = 1;
  if not found then raise exception 'Evaluation settings are required'; end if;
  if exists (
    select 1 from public.matchings m
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    where m.cycle_id = p_cycle_id
      and evaluator.active is true and evaluator.can_evaluate is not false
      and target.active is true and target.is_evaluatee is not false
      and not exists (select 1 from public.evaluations e where e.matching_id = m.id)
  ) then raise exception 'All active matchings must be submitted before finalization'; end if;
  if exists (
    select 1 from public.evaluation_result_adjustments
    where cycle_id = p_cycle_id and status = 'active' and workflow_status <> 'second_stage_adjusted'
  ) then raise exception 'All active adjustments require stage 2 completion'; end if;

  select count(distinct m.target_id)::integer into v_target_count
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  join public.evaluations e on e.matching_id = m.id
  where m.cycle_id = p_cycle_id
    and evaluator.active is true and evaluator.can_evaluate is not false
    and target.active is true and target.is_evaluatee is not false;
  if v_target_count = 0 then raise exception 'No completed evaluation targets exist for finalization'; end if;
  v_version := v_cycle.result_version + 1;

  create temporary table if not exists pg_temp.governance_finalization_source (
    target_id bigint primary key, name text, company text, dept text, workplace text,
    role text, employee_type text, cohort_key text, raw_score numeric(5,2),
    effective_score numeric(5,2), performance_score numeric(5,2),
    collaboration_score numeric(5,2), growth_score numeric(5,2), harmony_score numeric(5,2),
    category_labels jsonb, relative_grade text
  ) on commit drop;
  truncate pg_temp.governance_finalization_source;

  insert into pg_temp.governance_finalization_source (
    target_id,name,company,dept,workplace,role,employee_type,cohort_key,
    raw_score,effective_score,performance_score,collaboration_score,growth_score,harmony_score,category_labels
  )
  with per_target as (
    select m.target_id, round(avg(e.perf_score)::numeric, 2) as performance_score,
      round(avg(e.collab_score)::numeric, 2) as collaboration_score,
      round(avg(e.growth_score)::numeric, 2) as growth_score,
      round(avg(e.harmony_score)::numeric, 2) as harmony_score
    from public.matchings m
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    join public.evaluations e on e.matching_id = m.id
    where m.cycle_id = p_cycle_id
      and evaluator.active is true and evaluator.can_evaluate is not false
      and target.active is true and target.is_evaluatee is not false
    group by m.target_id
  ), calculated as (
    select p.*, round((p.performance_score * coalesce(v_settings.performance_weight, 40) / 100
      + p.collaboration_score * coalesce(v_settings.collaboration_weight, 30) / 100
      + p.growth_score * coalesce(v_settings.growth_weight, 20) / 100
      + p.harmony_score * coalesce(v_settings.harmony_weight, 10) / 100)::numeric, 2) as raw_score
    from per_target p
  )
  select u.id,u.name,u.company::text,u.dept,u.workplace,u.role,u.type::text,
    public.evaluation_cohort_key_for_profile(u.dept,u.workplace),
    c.raw_score,coalesce(a.final_score,c.raw_score),
    c.performance_score,c.collaboration_score,c.growth_score,c.harmony_score,
    public.canonical_category_labels_for_profile(u.type::text,u.role,u.dept,u.workplace)
  from calculated c
  join public.users u on u.id = c.target_id
  left join public.evaluation_result_adjustments a
    on a.cycle_id = p_cycle_id and a.target_id = c.target_id and a.status = 'active';

  with cohort_sizes as (
    select cohort_key,count(*)::integer as member_count from pg_temp.governance_finalization_source group by cohort_key
  ), base as (
    select cs.cohort_key,cs.member_count,v.grade,v.ratio,v.grade_order,
      floor(cs.member_count*v.ratio)::integer as base_count,
      (cs.member_count*v.ratio)-floor(cs.member_count*v.ratio) as remainder
    from cohort_sizes cs cross join (values
      ('S',0.05::numeric,1),('A',0.20::numeric,2),('B',0.60::numeric,3),('C',0.10::numeric,4),('D',0.05::numeric,5)
    ) as v(grade,ratio,grade_order)
  ), allocations as (
    select b.*,b.member_count-sum(b.base_count) over(partition by b.cohort_key) as remaining,
      row_number() over(partition by b.cohort_key order by b.remainder desc,b.grade_order) as remainder_rank from base b
  ), final_allocations as (
    select cohort_key,grade,ratio,grade_order,
      base_count+case when remainder_rank<=remaining then 1 else 0 end as allocation_count from allocations
  ), ranked as (
    select s.target_id,s.cohort_key,row_number() over(
      partition by s.cohort_key order by s.effective_score desc,s.raw_score desc,s.target_id
    ) as score_rank from pg_temp.governance_finalization_source s
  ), grade_ranges as (
    select a.*,coalesce(sum(a.allocation_count) over(
      partition by a.cohort_key order by a.grade_order rows between unbounded preceding and 1 preceding
    ),0)+1 as first_rank,sum(a.allocation_count) over(partition by a.cohort_key order by a.grade_order) as last_rank
    from final_allocations a
  )
  update pg_temp.governance_finalization_source s set relative_grade = r.grade
  from ranked k join grade_ranges r on r.cohort_key=k.cohort_key and k.score_rank between r.first_rank and r.last_rank
  where s.target_id=k.target_id;
  if exists (select 1 from pg_temp.governance_finalization_source where relative_grade is null) then
    raise exception 'Relative grade allocation did not cover every final target';
  end if;

  insert into public.evaluation_archives (cycle_id,cycle_name,closed_by,closed_by_name,closed_at,snapshot)
  select p_cycle_id,v_cycle.name,p_actor_id,'governance finalize',now(),jsonb_agg(jsonb_build_object(
    'id',s.target_id,'name',s.name,'company',s.company,'dept',s.dept,'role',s.role,
    'score',s.effective_score,'raw_score',s.raw_score,'grade',s.relative_grade,
    'is_adjusted',exists(select 1 from public.evaluation_result_adjustments a where a.cycle_id=p_cycle_id and a.target_id=s.target_id and a.status='active'),
    'category_labels',s.category_labels,
    'category_scores',jsonb_build_object('performance',s.performance_score,'collaboration',s.collaboration_score,'growth',s.growth_score,'harmony',s.harmony_score)
  ) order by s.target_id) from pg_temp.governance_finalization_source s returning id into v_archive_id;

  insert into public.evaluation_final_results (
    cycle_id,target_id,result_version,cohort_key,raw_score,effective_score,relative_grade,category_labels,category_scores,created_at
  )
  select p_cycle_id,s.target_id,v_version,s.cohort_key,s.raw_score,s.effective_score,s.relative_grade,s.category_labels,
    jsonb_build_object('performance',s.performance_score,'collaboration',s.collaboration_score,'growth',s.growth_score,'harmony',s.harmony_score),now()
  from pg_temp.governance_finalization_source s;

  insert into public.evaluation_cohort_snapshots (
    cycle_id,target_id,cohort_key,company,dept,workplace,role,employee_type,profile_snapshot,captured_by,captured_at
  )
  select p_cycle_id,s.target_id,s.cohort_key,s.company,s.dept,s.workplace,s.role,s.employee_type,
    jsonb_build_object('company',s.company,'dept',s.dept,'workplace',s.workplace,'role',s.role,'type',s.employee_type),p_actor_id,now()
  from pg_temp.governance_finalization_source s on conflict (cycle_id,target_id) do nothing;

  insert into public.evaluation_grade_allocations (cycle_id,cohort_key,grade,allocation_count,allocation_ratio,allocated_by,allocated_at)
  with cohort_sizes as (select cohort_key,count(*)::integer as member_count from pg_temp.governance_finalization_source group by cohort_key),
  base as (
    select cs.cohort_key,cs.member_count,v.grade,v.ratio,v.grade_order,floor(cs.member_count*v.ratio)::integer as base_count,
      (cs.member_count*v.ratio)-floor(cs.member_count*v.ratio) as remainder
    from cohort_sizes cs cross join (values
      ('S',0.05::numeric,1),('A',0.20::numeric,2),('B',0.60::numeric,3),('C',0.10::numeric,4),('D',0.05::numeric,5)
    ) as v(grade,ratio,grade_order)
  ), allocated as (
    select b.*,b.member_count-sum(b.base_count) over(partition by b.cohort_key) as remaining,
      row_number() over(partition by b.cohort_key order by b.remainder desc,b.grade_order) as remainder_rank from base b
  )
  select p_cycle_id,cohort_key,grade,base_count+case when remainder_rank<=remaining then 1 else 0 end,ratio,p_actor_id,now() from allocated
  on conflict (cycle_id,cohort_key,grade) do update set allocation_count=excluded.allocation_count,allocation_ratio=excluded.allocation_ratio,allocated_by=excluded.allocated_by,allocated_at=excluded.allocated_at;

  update public.evaluation_result_adjustments a set final_grade=r.relative_grade,updated_at=now()
  from public.evaluation_final_results r
  where a.cycle_id=p_cycle_id and a.status='active'
    and r.cycle_id=p_cycle_id and r.result_version=v_version and r.target_id=a.target_id;
  perform set_config('app.cycle_status_transition', 'finalize', true);
  update public.evaluation_cycles
  set status='마감/보관됨',closed_by=p_actor_id,closed_at=now(),result_version=v_version,
      results_published=false,result_gate_open=false,updated_at=now()
  where id=p_cycle_id;
  return jsonb_build_object('archive_id',v_archive_id,'result_version',v_version,'target_count',v_target_count);
end $$;

revoke all on function public.canonical_category_names_for_track(text), public.canonical_category_labels_for_profile(text,text,text,text), public.prevent_direct_cycle_status_transition(), public.prevent_profile_classification_mutation_while_cycle_locked() from public;
grant execute on function public.canonical_category_names_for_track(text), public.canonical_category_labels_for_profile(text,text,text,text) to authenticated, service_role;

commit;
