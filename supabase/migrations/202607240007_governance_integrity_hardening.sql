begin;

-- Stage adjustments are intentionally ungraded until the cycle is finalized.
-- The original table pre-dates relative grading and required a guessed grade.
alter table public.evaluation_result_adjustments
  alter column final_grade drop not null;

-- A published result must retain the four score components that produced it,
-- not only the labels shown in the UI.
alter table public.evaluation_final_results
  add column if not exists category_scores jsonb not null default '{}'::jsonb
    check (jsonb_typeof(category_scores) = 'object');

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select sys_role::text = '관리자'
    from public.users
    where auth_user_id = auth.uid() and active is true
    limit 1
  ), false)
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

-- Executives use narrowly-scoped RPC/API views.  They must not be able to
-- query personnel, matching, answers, raw evaluations, or employee goals.
drop policy if exists users_read_self_or_privileged on public.users;
create policy users_read_self_or_admin on public.users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists matchings_read_owner_or_privileged on public.matchings;
create policy matchings_read_owner_or_admin on public.matchings
  for select to authenticated
  using (evaluator_id = public.current_employee_id() or public.current_user_is_admin());

drop policy if exists evaluations_read_owner_or_privileged on public.evaluations;
create policy evaluations_read_owner_or_admin on public.evaluations
  for select to authenticated
  using (
    exists (
      select 1 from public.matchings m
      where m.id = evaluations.matching_id
        and m.evaluator_id = public.current_employee_id()
    ) or public.current_user_is_admin()
  );

drop policy if exists evaluation_answers_read_owner_or_privileged on public.evaluation_answers;
create policy evaluation_answers_read_owner_or_admin on public.evaluation_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.matchings m
      where m.id = evaluation_answers.matching_id
        and m.evaluator_id = public.current_employee_id()
    ) or public.current_user_is_admin()
  );

drop policy if exists employee_goals_read_self_or_privileged on public.employee_goals;
create policy employee_goals_read_self_or_admin on public.employee_goals
  for select to authenticated
  using (user_id = public.current_employee_id() or public.current_user_is_admin());

drop policy if exists result_adjustments_read_privileged on public.evaluation_result_adjustments;
create policy result_adjustments_read_admin on public.evaluation_result_adjustments
  for select to authenticated using (public.current_user_is_admin());

drop policy if exists result_adjustment_events_read_privileged on public.evaluation_result_adjustment_events;
create policy result_adjustment_events_read_admin on public.evaluation_result_adjustment_events
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists adjustments_read_privileged on public.score_adjustments;
create policy adjustments_read_admin on public.score_adjustments
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists adjustment_history_read_privileged on public.score_adjustment_history;
create policy adjustment_history_read_admin on public.score_adjustment_history
  for select to authenticated using (public.current_user_is_admin());

-- The existing privileged-audit policies are also narrowed: their rows reveal
-- individual score/approval history and are not executive browsing data.
drop policy if exists evaluation_cohort_snapshots_read_privileged on public.evaluation_cohort_snapshots;
create policy evaluation_cohort_snapshots_read_admin on public.evaluation_cohort_snapshots
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists evaluation_grade_allocations_read_privileged on public.evaluation_grade_allocations;
create policy evaluation_grade_allocations_read_admin on public.evaluation_grade_allocations
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists evaluation_adjustment_workflow_audit_read_privileged on public.evaluation_adjustment_workflow_audit;
create policy evaluation_adjustment_workflow_audit_read_admin on public.evaluation_adjustment_workflow_audit
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists evaluation_cycle_approval_requests_read_privileged on public.evaluation_cycle_approval_requests;
create policy evaluation_cycle_approval_requests_read_admin on public.evaluation_cycle_approval_requests
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists evaluation_cycle_approval_audit_read_privileged on public.evaluation_cycle_approval_audit;
create policy evaluation_cycle_approval_audit_read_admin on public.evaluation_cycle_approval_audit
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists evaluation_mail_dispatch_audit_read_privileged on public.evaluation_mail_dispatch_audit;
create policy evaluation_mail_dispatch_audit_read_admin on public.evaluation_mail_dispatch_audit
  for select to authenticated using (public.current_user_is_admin());
drop policy if exists evaluation_archives_read_privileged on public.evaluation_archives;
create policy evaluation_archives_read_admin on public.evaluation_archives
  for select to authenticated using (public.current_user_is_admin());

-- This is the only direct database view intended for an executive browser
-- session: aggregate governance state without people, answers, or scores.
create or replace function public.executive_cycle_governance_summary()
returns table (
  cycle_id bigint,
  cycle_name text,
  cycle_status text,
  result_version integer,
  approval_status text,
  results_published boolean,
  active_adjustment_count integer,
  stage2_adjustment_count integer
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if (select sys_role from public.users where auth_user_id = auth.uid() and active is true)
       not in ('관리자', '임원') then
    raise exception 'Privileged access required';
  end if;
  return query
  select c.id, c.name, c.status, c.result_version, c.internal_approval_status,
         c.results_published,
         count(a.id) filter (where a.status = 'active')::integer,
         count(a.id) filter (where a.status = 'active' and a.workflow_status = 'second_stage_adjusted')::integer
  from public.evaluation_cycles c
  left join public.evaluation_result_adjustments a on a.cycle_id = c.id
  group by c.id, c.name, c.status, c.result_version, c.internal_approval_status, c.results_published
  order by c.id desc;
end $$;

-- The client is never allowed to supply final scores, grades, cohorts, or
-- quota allocations.  All of them are recomputed below from locked source
-- rows in the same transaction that creates the immutable result version.
drop function if exists public.governance_finalize_cycle(bigint,uuid,jsonb,jsonb,jsonb,jsonb);
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

  -- Lock every source relation first, preventing concurrent submission or a
  -- score adjustment from producing an archive for a mixed input set.
  perform 1 from public.matchings where cycle_id = p_cycle_id for update;
  perform 1 from public.evaluations where cycle_id = p_cycle_id for update;
  perform 1 from public.evaluation_result_adjustments where cycle_id = p_cycle_id for update;
  select * into v_settings from public.evaluation_settings where id = 1;
  if not found then raise exception 'Evaluation settings are required'; end if;

  if exists (
    select 1
    from public.matchings m
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    where m.cycle_id = p_cycle_id
      and evaluator.active is true and evaluator.can_evaluate is not false
      and target.active is true and target.is_evaluatee is not false
      and not exists (select 1 from public.evaluations e where e.matching_id = m.id)
  ) then
    raise exception 'All active matchings must be submitted before finalization';
  end if;
  if exists (
    select 1 from public.evaluation_result_adjustments
    where cycle_id = p_cycle_id and status = 'active'
      and workflow_status <> 'second_stage_adjusted'
  ) then
    raise exception 'All active adjustments require stage 2 completion';
  end if;

  select count(distinct m.target_id)::integer into v_target_count
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  join public.evaluations e on e.matching_id = m.id
  where m.cycle_id = p_cycle_id
    and evaluator.active is true and evaluator.can_evaluate is not false
    and target.active is true and target.is_evaluatee is not false;
  if v_target_count = 0 then
    raise exception 'No completed evaluation targets exist for finalization';
  end if;

  v_version := v_cycle.result_version + 1;

  -- The volatile source values are materialized once, before archive/result
  -- writes, and then reused by every derived record in this transaction.
  create temporary table if not exists pg_temp.governance_finalization_source (
    target_id bigint primary key,
    name text,
    company text,
    dept text,
    workplace text,
    role text,
    employee_type text,
    cohort_key text,
    raw_score numeric(5,2),
    effective_score numeric(5,2),
    performance_score numeric(5,2),
    collaboration_score numeric(5,2),
    growth_score numeric(5,2),
    harmony_score numeric(5,2),
    category_labels jsonb,
    relative_grade text
  ) on commit drop;
  truncate pg_temp.governance_finalization_source;

  insert into pg_temp.governance_finalization_source (
    target_id,name,company,dept,workplace,role,employee_type,cohort_key,
    raw_score,effective_score,performance_score,collaboration_score,growth_score,harmony_score,category_labels
  )
  with per_target as (
    select m.target_id,
      round(avg(e.perf_score)::numeric, 2) as performance_score,
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
  select u.id, u.name, u.company::text, u.dept, u.workplace, u.role, u.type::text,
    case when coalesce(u.dept,'') like '%정비%' then 'mechanic'
         when coalesce(u.dept,'') like '%영업소%' or coalesce(u.workplace,'') like '%영업소%' then 'branch'
         else 'headquarters' end,
    c.raw_score,
    coalesce(a.final_score, c.raw_score),
    c.performance_score, c.collaboration_score, c.growth_score, c.harmony_score,
    case
      when coalesce(u.dept,'') like '%정비%' then jsonb_build_array('역량 개발','정비 능력','책임/주인의식','안전의식')
      when coalesce(u.dept,'') like '%영업소%' or coalesce(u.workplace,'') like '%영업소%' then jsonb_build_array('비상대응','소통 협력','솔선 수범','갈등 해소')
      when u.type::text in ('팀장급','부서실장급','임원급')
        or coalesce(u.role,'') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)'
        then jsonb_build_array('리더십','팀원 육성','소통','전략적 사고')
      else jsonb_build_array('성과','협업','성장','조화')
    end
  from calculated c
  join public.users u on u.id = c.target_id
  left join public.evaluation_result_adjustments a
    on a.cycle_id = p_cycle_id and a.target_id = c.target_id and a.status = 'active';

  -- Largest-remainder allocation: S 5%, A 20%, B 60%, C 10%, D 5%, with
  -- deterministic tie breaking S -> A -> B -> C -> D.
  with cohort_sizes as (
    select cohort_key, count(*)::integer as member_count
    from pg_temp.governance_finalization_source group by cohort_key
  ), base as (
    select cs.cohort_key, cs.member_count, v.grade, v.ratio, v.grade_order,
      floor(cs.member_count * v.ratio)::integer as base_count,
      (cs.member_count * v.ratio) - floor(cs.member_count * v.ratio) as remainder
    from cohort_sizes cs
    cross join (values ('S',0.05::numeric,1),('A',0.20::numeric,2),('B',0.60::numeric,3),('C',0.10::numeric,4),('D',0.05::numeric,5)) as v(grade,ratio,grade_order)
  ), allocations as (
    select b.*, b.member_count - sum(b.base_count) over (partition by b.cohort_key) as remaining,
      row_number() over (partition by b.cohort_key order by b.remainder desc, b.grade_order) as remainder_rank
    from base b
  ), final_allocations as (
    select cohort_key, grade, ratio, grade_order,
      base_count + case when remainder_rank <= remaining then 1 else 0 end as allocation_count
    from allocations
  ), ranked as (
    select s.target_id, s.cohort_key,
      row_number() over (partition by s.cohort_key order by s.effective_score desc, s.raw_score desc, s.target_id) as score_rank
    from pg_temp.governance_finalization_source s
  ), grade_ranges as (
    select a.*, coalesce(sum(a.allocation_count) over (partition by a.cohort_key order by a.grade_order rows between unbounded preceding and 1 preceding),0) + 1 as first_rank,
      sum(a.allocation_count) over (partition by a.cohort_key order by a.grade_order) as last_rank
    from final_allocations a
  )
  update pg_temp.governance_finalization_source s
  set relative_grade = r.grade
  from ranked k
  join grade_ranges r on r.cohort_key = k.cohort_key and k.score_rank between r.first_rank and r.last_rank
  where s.target_id = k.target_id;

  if exists (select 1 from pg_temp.governance_finalization_source where relative_grade is null) then
    raise exception 'Relative grade allocation did not cover every final target';
  end if;

  insert into public.evaluation_archives (cycle_id,cycle_name,closed_by,closed_by_name,closed_at,snapshot)
  select p_cycle_id, v_cycle.name, p_actor_id, 'governance finalize', now(),
    jsonb_agg(jsonb_build_object(
      'id',s.target_id,'name',s.name,'company',s.company,'dept',s.dept,'role',s.role,
      'score',s.effective_score,'raw_score',s.raw_score,'grade',s.relative_grade,
      'is_adjusted',exists(select 1 from public.evaluation_result_adjustments a where a.cycle_id=p_cycle_id and a.target_id=s.target_id and a.status='active'),
      'category_labels',s.category_labels,
      'category_scores',jsonb_build_object('performance',s.performance_score,'collaboration',s.collaboration_score,'growth',s.growth_score,'harmony',s.harmony_score)
    ) order by s.target_id)
  from pg_temp.governance_finalization_source s
  returning id into v_archive_id;

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
  from pg_temp.governance_finalization_source s
  on conflict (cycle_id,target_id) do nothing;

  insert into public.evaluation_grade_allocations (
    cycle_id,cohort_key,grade,allocation_count,allocation_ratio,allocated_by,allocated_at
  )
  with cohort_sizes as (select cohort_key,count(*)::integer as member_count from pg_temp.governance_finalization_source group by cohort_key),
  base as (
    select cs.cohort_key,cs.member_count,v.grade,v.ratio,v.grade_order,floor(cs.member_count*v.ratio)::integer as base_count,
      (cs.member_count*v.ratio)-floor(cs.member_count*v.ratio) as remainder
    from cohort_sizes cs cross join (values ('S',0.05::numeric,1),('A',0.20::numeric,2),('B',0.60::numeric,3),('C',0.10::numeric,4),('D',0.05::numeric,5)) as v(grade,ratio,grade_order)
  ), allocated as (
    select b.*,b.member_count-sum(b.base_count) over(partition by b.cohort_key) as remaining,
      row_number() over(partition by b.cohort_key order by b.remainder desc,b.grade_order) as remainder_rank from base b
  )
  select p_cycle_id,cohort_key,grade,base_count+case when remainder_rank<=remaining then 1 else 0 end,ratio,p_actor_id,now() from allocated
  on conflict (cycle_id,cohort_key,grade) do update set allocation_count=excluded.allocation_count,allocation_ratio=excluded.allocation_ratio,allocated_by=excluded.allocated_by,allocated_at=excluded.allocated_at;

  update public.evaluation_result_adjustments a
  set final_grade = r.relative_grade, updated_at = now()
  from public.evaluation_final_results r
  where a.cycle_id = p_cycle_id and a.status = 'active'
    and r.cycle_id = p_cycle_id and r.result_version = v_version and r.target_id = a.target_id;

  update public.evaluation_cycles
  set status='마감/보관됨',closed_by=p_actor_id,closed_at=now(),result_version=v_version,
      results_published=false,result_gate_open=false,updated_at=now()
  where id=p_cycle_id;

  return jsonb_build_object('archive_id',v_archive_id,'result_version',v_version,'target_count',v_target_count);
end $$;

create or replace function public.governance_publish_results(p_cycle_id bigint, p_published boolean, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cycle public.evaluation_cycles;
begin
  if public.governance_actor_role(p_actor_id) <> '임원' then raise exception 'Executive role required'; end if;
  select * into v_cycle from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if p_published and (
    v_cycle.status <> '마감/보관됨' or v_cycle.internal_approval_status <> 'approved'
    or not v_cycle.result_gate_open
    or not exists (select 1 from public.evaluation_final_results r where r.cycle_id=p_cycle_id and r.result_version=v_cycle.result_version)
    or not exists (select 1 from public.evaluation_cycle_approval_requests q where q.cycle_id=p_cycle_id and q.request_status='approved' and q.result_version=v_cycle.result_version)
  ) then
    raise exception 'Approved current result version required before publication';
  end if;
  update public.evaluation_cycles set results_published=p_published,updated_at=now() where id=p_cycle_id;
  insert into public.evaluation_cycle_approval_audit (cycle_id,action,note,acted_by,acted_at)
  values (p_cycle_id,case when p_published then 'gate_opened' else 'gate_closed' end,
    case when p_published then 'Results published' else 'Results unpublished' end,p_actor_id,now());
  return jsonb_build_object('cycle_id',p_cycle_id,'published',p_published,'result_version',v_cycle.result_version);
end $$;

-- Finalization needs all required category coverage for the actual matching
-- track/audience combination, not a generic four-category configuration.
create or replace function public.validate_cycle_question_coverage(p_cycle_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  with required_scope as (
    select distinct m.target_id, m.relationship_type,
      case
        when coalesce(t.dept,'') like '%정비%' then 'mechanic'
        when coalesce(t.dept,'') like '%영업소%' or coalesce(t.workplace,'') like '%영업소%' then 'branch_employee'
        when t.type::text in ('팀장급','부서실장급','임원급') or coalesce(t.role,'') ~ '(팀장|부장|실장|본부장|소장|지점장|센터장|이사|상무|전무|대표|임원)' then 'headquarters_leader'
        else 'headquarters_member'
      end as target_track,
      coalesce(t.dept,'') as target_dept
    from public.matchings m join public.users t on t.id=m.target_id
    where m.cycle_id=p_cycle_id and t.active is true and t.is_evaluatee is not false
  ), required_categories as (
    select rs.target_id,rs.relationship_type,rs.target_track,rs.target_dept,unnest(
      case rs.target_track
        when 'headquarters_member' then array['성과','협업','성장','조화']
        when 'headquarters_leader' then array['리더십','팀원 육성','소통','전략적 사고']
        when 'branch_employee' then array['비상대응','소통 협력','솔선 수범','갈등 해소']
        else array['역량 개발','정비 능력','책임/주인의식','안전의식']
      end
    ) as category
    from required_scope rs
  ), missing as (
    select rc.* from required_categories rc
    where not exists (
      select 1 from public.evaluation_questions q
      where q.cycle_id=p_cycle_id and q.category=rc.category
        and coalesce(q.type,'') <> '서술형' and coalesce(q.weight,0)>0 and coalesce(q.max_score,0)>0
        and (coalesce(q.audience,'all')='all' or q.audience=rc.relationship_type)
        and (q.target_track is null or q.target_track in ('기본 필수질문','all',rc.target_track)
             or (rc.target_track='headquarters_member' and q.target_track='본사 팀원급')
             or (rc.target_track='headquarters_leader' and q.target_track='팀장·부서장급')
             or (rc.target_track='branch_employee' and q.target_track='영업소 직원')
             or (rc.target_track='mechanic' and q.target_track='정비사'))
        and (q.target_dept is null or q.target_dept='전체' or rc.target_dept like '%'||q.target_dept||'%')
    )
  )
  select jsonb_build_object('ok',not exists(select 1 from missing),'issues',coalesce(jsonb_agg(jsonb_build_object(
    'code','QUESTION_COVERAGE_MISSING','target_id',target_id,'relationship_type',relationship_type,'target_track',target_track,'category',category
  )), '[]'::jsonb)) from missing
$$;

-- Keep the existing broad cycle validator, but make activation fail if a real
-- matching scope has no applicable positively weighted question.
create or replace function public.activate_evaluation_cycle(p_cycle_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_report jsonb; v_coverage jsonb; v_messages text;
begin
  perform 1 from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  v_report := public.validate_evaluation_cycle(p_cycle_id);
  v_coverage := public.validate_cycle_question_coverage(p_cycle_id);
  if coalesce((v_report->>'ok')::boolean,false) is not true or coalesce((v_coverage->>'ok')::boolean,false) is not true then
    select string_agg(coalesce(item->>'message',format('%s: %s',item->>'target_track',item->>'category')), E'\n') into v_messages
    from jsonb_array_elements(coalesce(v_report->'issues','[]'::jsonb) || coalesce(v_coverage->'issues','[]'::jsonb)) item;
    raise exception 'Evaluation cycle activation failed:%', E'\n'||coalesce(v_messages,'Invalid configuration');
  end if;
  update public.evaluation_cycles set status='진행중',updated_at=now() where id=p_cycle_id;
  return v_report || jsonb_build_object('activated',true,'question_coverage',v_coverage);
end $$;

revoke all on function public.governance_finalize_cycle(bigint,uuid),public.governance_publish_results(bigint,boolean,uuid),public.executive_cycle_governance_summary(),public.validate_cycle_question_coverage(bigint) from public;
grant execute on function public.governance_finalize_cycle(bigint,uuid),public.governance_publish_results(bigint,boolean,uuid),public.executive_cycle_governance_summary() to authenticated;
revoke execute on function public.validate_cycle_question_coverage(bigint) from authenticated;

commit;
