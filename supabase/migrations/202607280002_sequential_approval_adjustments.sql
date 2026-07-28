begin;

-- Keep the existing pre-approval adjustment path, but allow only the current
-- approval-line executive to adjust the frozen result while approval is active.
create or replace function public.governance_adjust_final_score(
  p_cycle_id bigint,
  p_target_id bigint,
  p_final_score numeric,
  p_grade_override text,
  p_reason text,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_request public.evaluation_cycle_approval_requests;
  v_step public.evaluation_cycle_approval_steps;
  v_result_row public.evaluation_final_results;
  v_previous public.evaluation_result_adjustments;
  v_adjustment public.evaluation_result_adjustments;
  v_role text;
  v_grade text := nullif(upper(trim(coalesce(p_grade_override, ''))), '');
  v_result jsonb;
begin
  if p_final_score is null or p_final_score not between 0 and 100
     or length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A valid score and a reason of at least 10 characters are required';
  end if;
  if v_grade is not null and v_grade not in ('S','A','B','C','D') then
    raise exception 'Invalid approved grade';
  end if;

  v_role := public.governance_actor_role(p_actor_id);
  select * into v_cycle
  from public.evaluation_cycles
  where id = p_cycle_id
  for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;

  if v_cycle.internal_approval_status <> 'requested' then
    v_result := public.governance_adjust_final_score(
      p_cycle_id, p_target_id, p_final_score, p_reason, p_actor_id
    );
    update public.evaluation_result_adjustments
    set grade_override = v_grade, updated_at = now()
    where cycle_id = p_cycle_id and target_id = p_target_id and status = 'active';
    return v_result || jsonb_build_object('grade_override', v_grade);
  end if;

  if v_role <> '임원' then
    raise exception 'Only the current approval-line executive may adjust results';
  end if;

  select * into v_request
  from public.evaluation_cycle_approval_requests
  where cycle_id = p_cycle_id
    and request_status = 'requested'
    and result_version = v_cycle.result_version;
  if not found then raise exception 'Pending approval request not found'; end if;

  select * into v_step
  from public.evaluation_cycle_approval_steps
  where approval_request_id = v_request.id and status = 'pending'
  order by step_order
  limit 1;
  if not found or v_step.approver_id is distinct from p_actor_id then
    raise exception 'Only the current approval-line executive may adjust results';
  end if;

  select * into v_result_row
  from public.evaluation_final_results
  where cycle_id = p_cycle_id
    and target_id = p_target_id
    and result_version = v_cycle.result_version
  for update;
  if not found then raise exception 'Current final result not found'; end if;

  select * into v_previous
  from public.evaluation_result_adjustments
  where cycle_id = p_cycle_id and target_id = p_target_id
  for update;

  insert into public.evaluation_result_adjustments (
    cycle_id,target_id,raw_score,final_score,final_grade,grade_override,reason,
    adjusted_by,adjusted_at,updated_at,status,workflow_status,
    first_stage_by,first_stage_at,second_stage_by,second_stage_at,
    cancelled_by,cancelled_at,cancellation_reason
  )
  values (
    p_cycle_id,p_target_id,v_result_row.raw_score,p_final_score,
    coalesce(v_grade,v_result_row.relative_grade),v_grade,trim(p_reason),
    p_actor_id,now(),now(),'active','second_stage_adjusted',
    v_previous.first_stage_by,v_previous.first_stage_at,p_actor_id,now(),
    null,null,null
  )
  on conflict (cycle_id,target_id) do update set
    raw_score=excluded.raw_score,
    final_score=excluded.final_score,
    final_grade=excluded.final_grade,
    grade_override=excluded.grade_override,
    reason=excluded.reason,
    adjusted_by=excluded.adjusted_by,
    adjusted_at=excluded.adjusted_at,
    updated_at=excluded.updated_at,
    status='active',
    workflow_status='second_stage_adjusted',
    second_stage_by=p_actor_id,
    second_stage_at=now(),
    cancelled_by=null,
    cancelled_at=null,
    cancellation_reason=null
  returning * into v_adjustment;

  update public.evaluation_final_results
  set effective_score = p_final_score,
      approved_grade = coalesce(v_grade, relative_grade)
  where cycle_id = p_cycle_id
    and target_id = p_target_id
    and result_version = v_cycle.result_version;

  update public.evaluation_archives archive
  set snapshot = (
    select jsonb_agg(
      case
        when (item->>'id')::bigint = p_target_id then
          item || jsonb_build_object(
            'raw_score',v_result_row.raw_score,
            'score',p_final_score,
            'grade',coalesce(v_grade,v_result_row.relative_grade),
            'is_adjusted',(
              p_final_score is distinct from v_result_row.raw_score
              or coalesce(v_grade,v_result_row.relative_grade) is distinct from v_result_row.relative_grade
            ),
            'adjustment_reason',trim(p_reason)
          )
        else item
      end
      order by ordinal
    )
    from jsonb_array_elements(archive.snapshot) with ordinality snapshot(item,ordinal)
  )
  where archive.cycle_id = p_cycle_id;

  insert into public.evaluation_result_adjustment_events (
    adjustment_id,cycle_id,target_id,event_type,previous_final_score,
    next_final_score,reason,acted_by,occurred_at
  )
  values (
    v_adjustment.id,p_cycle_id,p_target_id,
    case when v_previous.id is null then 'created' else 'updated' end,
    coalesce(v_previous.final_score,v_result_row.effective_score),
    p_final_score,trim(p_reason),p_actor_id,now()
  );

  insert into public.evaluation_adjustment_workflow_audit (
    adjustment_id,cycle_id,target_id,stage,actor_role,action,
    previous_score,next_score,reason,acted_by,acted_at
  )
  values (
    v_adjustment.id,p_cycle_id,p_target_id,2,'executive','adjusted',
    coalesce(v_previous.final_score,v_result_row.effective_score),
    p_final_score,trim(p_reason),p_actor_id,now()
  );

  return jsonb_build_object(
    'adjustment_id',v_adjustment.id,
    'workflow_status','second_stage_adjusted',
    'approval_step',v_step.step_order,
    'grade_override',v_grade
  );
end $$;

revoke all on function public.governance_adjust_final_score(bigint,bigint,numeric,text,text,uuid) from public;
grant execute on function public.governance_adjust_final_score(bigint,bigint,numeric,text,text,uuid) to authenticated;

commit;
