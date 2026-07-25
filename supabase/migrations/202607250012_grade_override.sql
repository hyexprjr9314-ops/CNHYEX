begin;

alter table public.evaluation_result_adjustments
  add column if not exists grade_override text
  check (grade_override is null or grade_override in ('S','A','B','C','D'));

alter table public.evaluation_final_results
  add column if not exists approved_grade text
  check (approved_grade is null or approved_grade in ('S','A','B','C','D'));

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
declare v_result jsonb; v_grade text := nullif(upper(trim(coalesce(p_grade_override, ''))), '');
begin
  if v_grade is not null and v_grade not in ('S','A','B','C','D') then
    raise exception 'Invalid approved grade';
  end if;

  v_result := public.governance_adjust_final_score(
    p_cycle_id, p_target_id, p_final_score, p_reason, p_actor_id
  );

  update public.evaluation_result_adjustments
  set grade_override = v_grade, updated_at = now()
  where cycle_id = p_cycle_id and target_id = p_target_id and status = 'active';

  return v_result || jsonb_build_object('grade_override', v_grade);
end $$;

revoke all on function public.governance_adjust_final_score(bigint,bigint,numeric,text,text,uuid) from public;
grant execute on function public.governance_adjust_final_score(bigint,bigint,numeric,text,text,uuid) to authenticated;

create or replace function public.governance_request_approval(
  p_cycle_id bigint, p_actor_id uuid, p_approver_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_request public.evaluation_cycle_approval_requests; v_approver uuid; v_order integer := 0;
begin
  v_role := public.governance_actor_role(p_actor_id);
  if v_role <> '관리자' then raise exception 'Administrator role required'; end if;
  if p_approver_ids is null or cardinality(p_approver_ids) not between 1 and 2
     or cardinality(p_approver_ids) <> (select count(distinct x) from unnest(p_approver_ids) x)
     or p_actor_id = any(p_approver_ids) then raise exception 'One or two unique executive approvers are required'; end if;
  if exists (
    select 1 from unnest(p_approver_ids) x
    where not exists (
      select 1 from public.users u
      where u.auth_user_id = x and u.active is true and u.sys_role::text = '임원'
    )
  ) then raise exception 'Every approver must be an active executive'; end if;

  perform 1 from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;

  if not exists (select 1 from public.evaluation_archives where cycle_id=p_cycle_id) then
    perform public.governance_finalize_cycle(p_cycle_id, p_actor_id);
  end if;

  if exists (
    select 1 from public.evaluation_result_adjustments
    where cycle_id=p_cycle_id and status='active' and workflow_status <> 'second_stage_adjusted'
  ) then raise exception 'All active adjustments require stage 2 completion'; end if;

  update public.evaluation_final_results r
  set approved_grade = coalesce(a.grade_override, r.relative_grade)
  from public.evaluation_cycles c
  left join public.evaluation_result_adjustments a
    on a.cycle_id = c.id and a.target_id = r.target_id and a.status = 'active'
  where c.id = p_cycle_id and r.cycle_id = c.id and r.result_version = c.result_version;

  insert into public.evaluation_cycle_approval_requests
    (cycle_id,request_status,requested_by,requested_at,result_version,created_at,updated_at)
  select p_cycle_id,'requested',p_actor_id,now(),result_version,now(),now()
    from public.evaluation_cycles where id=p_cycle_id returning * into v_request;
  foreach v_approver in array p_approver_ids loop
    v_order := v_order + 1;
    insert into public.evaluation_cycle_approval_steps
      (approval_request_id,step_order,approver_id,approver_user_id)
    select v_request.id,v_order,v_approver,u.id from public.users u where u.auth_user_id=v_approver;
  end loop;
  update public.evaluation_cycles
    set internal_approval_status='requested',result_gate_open=false,updated_at=now()
    where id=p_cycle_id;
  insert into public.evaluation_cycle_approval_audit
    (approval_request_id,cycle_id,action,acted_by,acted_at)
  values (v_request.id,p_cycle_id,'requested',p_actor_id,now());
  return jsonb_build_object(
    'approval_request_id',v_request.id,
    'status','requested',
    'approver_count',v_order
  );
end $$;

revoke all on function public.governance_request_approval(bigint,uuid,uuid[]) from public;
grant execute on function public.governance_request_approval(bigint,uuid,uuid[]) to authenticated;

commit;
