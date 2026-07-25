begin;

create or replace function public.governance_adjust_final_score(
  p_cycle_id bigint,
  p_target_id bigint,
  p_final_score numeric,
  p_reason text,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_previous public.evaluation_result_adjustments;
  v_record public.evaluation_result_adjustments;
  v_actor_role text;
  v_stage smallint;
  v_raw_score numeric;
  v_assigned_count integer;
  v_submitted_count integer;
begin
  v_role := public.governance_actor_role(p_actor_id);
  if v_role not in ('관리자', '임원') then
    raise exception 'Administrator or executive role required';
  end if;
  perform public.governance_require_open_cycle(p_cycle_id);
  if p_final_score not between 0 and 100
     or length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A valid score and a reason of at least 10 characters are required';
  end if;

  select count(m.id)::integer, count(e.id)::integer
  into v_assigned_count, v_submitted_count
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  left join public.evaluations e on e.matching_id = m.id
  where m.cycle_id = p_cycle_id
    and m.target_id = p_target_id
    and evaluator.active is true
    and evaluator.can_evaluate is not false
    and target.active is true
    and target.is_evaluatee is not false;
  if v_assigned_count = 0 or v_submitted_count <> v_assigned_count then
    raise exception 'All assigned evaluations must be complete before adjustment';
  end if;

  select round((
    avg(e.perf_score) * public.category_weight_for_target(
      s.track_category_weights,p_target_id,1,coalesce(s.performance_weight,40)
    ) / 100
    + avg(e.collab_score) * public.category_weight_for_target(
      s.track_category_weights,p_target_id,2,coalesce(s.collaboration_weight,30)
    ) / 100
    + avg(e.growth_score) * public.category_weight_for_target(
      s.track_category_weights,p_target_id,3,coalesce(s.growth_weight,20)
    ) / 100
    + avg(e.harmony_score) * public.category_weight_for_target(
      s.track_category_weights,p_target_id,4,coalesce(s.harmony_weight,10)
    ) / 100
  )::numeric, 2)
  into v_raw_score
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  join public.evaluations e on e.matching_id = m.id
  cross join public.evaluation_settings s
  where m.cycle_id = p_cycle_id
    and m.target_id = p_target_id
    and s.id = 1
    and evaluator.active is true
    and evaluator.can_evaluate is not false
    and target.active is true
    and target.is_evaluatee is not false;
  if v_raw_score is null then raise exception 'Unable to calculate the source score'; end if;

  select * into v_previous
  from public.evaluation_result_adjustments
  where cycle_id = p_cycle_id and target_id = p_target_id
  for update;

  insert into public.evaluation_result_adjustments (
    cycle_id,target_id,raw_score,final_score,final_grade,reason,
    adjusted_by,adjusted_at,updated_at,status,workflow_status,
    first_stage_by,first_stage_at,second_stage_by,second_stage_at,
    cancelled_by,cancelled_at,cancellation_reason
  )
  values (
    p_cycle_id,p_target_id,v_raw_score,p_final_score,null,trim(p_reason),
    p_actor_id,now(),now(),'active','second_stage_adjusted',
    case when v_role = '관리자' then p_actor_id end,
    case when v_role = '관리자' then now() end,
    case when v_role = '임원' then p_actor_id end,
    case when v_role = '임원' then now() end,
    null,null,null
  )
  on conflict (cycle_id,target_id) do update set
    raw_score=excluded.raw_score,
    final_score=excluded.final_score,
    final_grade=null,
    reason=excluded.reason,
    adjusted_by=excluded.adjusted_by,
    adjusted_at=excluded.adjusted_at,
    updated_at=excluded.updated_at,
    status='active',
    workflow_status='second_stage_adjusted',
    first_stage_by=case when v_role = '관리자' then p_actor_id else evaluation_result_adjustments.first_stage_by end,
    first_stage_at=case when v_role = '관리자' then now() else evaluation_result_adjustments.first_stage_at end,
    second_stage_by=case when v_role = '임원' then p_actor_id else evaluation_result_adjustments.second_stage_by end,
    second_stage_at=case when v_role = '임원' then now() else evaluation_result_adjustments.second_stage_at end,
    cancelled_by=null,
    cancelled_at=null,
    cancellation_reason=null
  returning * into v_record;

  insert into public.evaluation_result_adjustment_events (
    adjustment_id,cycle_id,target_id,event_type,previous_final_score,
    next_final_score,reason,acted_by,occurred_at
  )
  values (
    v_record.id,p_cycle_id,p_target_id,
    case when v_previous.id is null then 'created' else 'updated' end,
    v_previous.final_score,p_final_score,trim(p_reason),p_actor_id,now()
  );

  v_actor_role := case when v_role = '관리자' then 'admin' else 'executive' end;
  v_stage := case when v_role = '관리자' then 1 else 2 end;
  insert into public.evaluation_adjustment_workflow_audit (
    adjustment_id,cycle_id,target_id,stage,actor_role,action,
    previous_score,next_score,reason,acted_by,acted_at
  )
  values (
    v_record.id,p_cycle_id,p_target_id,v_stage,v_actor_role,'adjusted',
    v_previous.final_score,p_final_score,trim(p_reason),p_actor_id,now()
  );

  return jsonb_build_object(
    'adjustment_id',v_record.id,
    'workflow_status','second_stage_adjusted',
    'adjusted_by_role',v_actor_role
  );
end $$;

create or replace function public.governance_cancel_adjustment(
  p_cycle_id bigint, p_target_id bigint, p_reason text, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_record public.evaluation_result_adjustments;
begin
  v_role := public.governance_actor_role(p_actor_id);
  if v_role not in ('관리자', '임원') then
    raise exception 'Administrator or executive role required';
  end if;
  perform public.governance_require_open_cycle(p_cycle_id);
  if length(trim(coalesce(p_reason,''))) < 10 then
    raise exception 'Cancellation reason is required';
  end if;
  select * into v_record
  from public.evaluation_result_adjustments
  where cycle_id=p_cycle_id and target_id=p_target_id and status='active'
  for update;
  if not found then raise exception 'Active adjustment not found'; end if;
  update public.evaluation_result_adjustments
  set status='cancelled',cancelled_by=p_actor_id,cancelled_at=now(),
      cancellation_reason=trim(p_reason),updated_at=now()
  where id=v_record.id;
  insert into public.evaluation_result_adjustment_events (
    adjustment_id,cycle_id,target_id,event_type,previous_final_score,
    next_final_score,reason,acted_by,occurred_at
  )
  values (
    v_record.id,p_cycle_id,p_target_id,'cancelled',v_record.final_score,
    v_record.raw_score,trim(p_reason),p_actor_id,now()
  );
  return jsonb_build_object('adjustment_id',v_record.id,'status','cancelled');
end $$;

revoke all on function public.governance_adjust_final_score(bigint,bigint,numeric,text,uuid) from public;
revoke all on function public.governance_cancel_adjustment(bigint,bigint,text,uuid) from public;
grant execute on function public.governance_adjust_final_score(bigint,bigint,numeric,text,uuid) to authenticated;
grant execute on function public.governance_cancel_adjustment(bigint,bigint,text,uuid) to authenticated;

commit;
