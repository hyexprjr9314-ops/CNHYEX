begin;

alter table public.evaluation_cycles add column if not exists result_version integer not null default 0;
alter table public.evaluation_cycle_approval_requests add column if not exists result_version integer;
alter table public.evaluation_mail_dispatch_audit add column if not exists result_version integer;

create table if not exists public.evaluation_final_results (
  cycle_id bigint not null references public.evaluation_cycles(id) on delete restrict,
  target_id bigint not null references public.users(id) on delete restrict,
  result_version integer not null check (result_version > 0),
  cohort_key text not null,
  raw_score numeric(5,2) not null check (raw_score between 0 and 100),
  effective_score numeric(5,2) not null check (effective_score between 0 and 100),
  relative_grade text not null check (relative_grade in ('S','A','B','C','D')),
  category_labels jsonb not null check (jsonb_typeof(category_labels) = 'array'),
  created_at timestamptz not null default now(),
  primary key (cycle_id, target_id, result_version)
);
alter table public.evaluation_final_results enable row level security;
revoke all on table public.evaluation_final_results from anon, authenticated;
grant select, insert on table public.evaluation_final_results to service_role;

-- Every privileged state transition below locks its cycle before validating or writing.
create or replace function public.governance_actor_role(p_actor_id uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_role text;
begin
  if auth.uid() is distinct from p_actor_id then raise exception 'Actor does not match authenticated user'; end if;
  select sys_role into v_role from public.users where auth_user_id = p_actor_id and active is true;
  if v_role is null then raise exception 'Active user profile is required'; end if;
  return v_role;
end $$;

create or replace function public.governance_require_open_cycle(p_cycle_id bigint)
returns public.evaluation_cycles language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cycle public.evaluation_cycles;
begin
  select * into v_cycle from public.evaluation_cycles where id = p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if v_cycle.status <> '진행중' or v_cycle.internal_approval_status <> 'not_requested' then
    raise exception 'The cycle is no longer open for score adjustments';
  end if;
  return v_cycle;
end $$;

create or replace function public.governance_stage1_adjust(p_cycle_id bigint, p_target_id bigint, p_raw_score numeric, p_final_score numeric, p_reason text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_previous public.evaluation_result_adjustments; v_record public.evaluation_result_adjustments;
begin
  v_role := public.governance_actor_role(p_actor_id); if v_role <> '관리자' then raise exception 'Administrator role required'; end if;
  perform public.governance_require_open_cycle(p_cycle_id);
  if p_raw_score not between 0 and 100 or p_final_score not between 0 and 100 or length(trim(coalesce(p_reason,''))) < 10 then raise exception 'Valid scores and a reason of at least 10 characters are required'; end if;
  select * into v_previous from public.evaluation_result_adjustments where cycle_id=p_cycle_id and target_id=p_target_id for update;
  insert into public.evaluation_result_adjustments (cycle_id,target_id,raw_score,final_score,final_grade,reason,adjusted_by,adjusted_at,updated_at,status,workflow_status,first_stage_by,first_stage_at,cancelled_by,cancelled_at,cancellation_reason)
  values (p_cycle_id,p_target_id,p_raw_score,p_final_score,null,trim(p_reason),p_actor_id,now(),now(),'active','first_stage_adjusted',p_actor_id,now(),null,null,null)
  on conflict (cycle_id,target_id) do update set raw_score=excluded.raw_score,final_score=excluded.final_score,final_grade=null,reason=excluded.reason,adjusted_by=excluded.adjusted_by,adjusted_at=excluded.adjusted_at,updated_at=excluded.updated_at,status='active',workflow_status='first_stage_adjusted',first_stage_by=excluded.first_stage_by,first_stage_at=excluded.first_stage_at,second_stage_by=null,second_stage_at=null,cancelled_by=null,cancelled_at=null,cancellation_reason=null
  returning * into v_record;
  insert into public.evaluation_result_adjustment_events (adjustment_id,cycle_id,target_id,event_type,previous_final_score,next_final_score,reason,acted_by,occurred_at)
  values (v_record.id,p_cycle_id,p_target_id,case when v_previous.id is null then 'created' else 'updated' end,v_previous.final_score,p_final_score,trim(p_reason),p_actor_id,now());
  insert into public.evaluation_adjustment_workflow_audit (adjustment_id,cycle_id,target_id,stage,actor_role,action,previous_score,next_score,reason,acted_by,acted_at)
  values (v_record.id,p_cycle_id,p_target_id,1,'admin','adjusted',v_previous.final_score,p_final_score,trim(p_reason),p_actor_id,now());
  return jsonb_build_object('adjustment_id',v_record.id,'workflow_status',v_record.workflow_status);
end $$;

create or replace function public.governance_stage2_adjust(p_cycle_id bigint, p_target_id bigint, p_final_score numeric, p_reason text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_record public.evaluation_result_adjustments; v_score numeric;
begin
  v_role := public.governance_actor_role(p_actor_id); if v_role <> '임원' then raise exception 'Executive role required'; end if;
  perform public.governance_require_open_cycle(p_cycle_id);
  select * into v_record from public.evaluation_result_adjustments where cycle_id=p_cycle_id and target_id=p_target_id and status='active' for update;
  if not found or v_record.workflow_status <> 'first_stage_adjusted' then raise exception 'A first-stage adjustment is required'; end if;
  v_score := coalesce(p_final_score,v_record.final_score);
  if v_score not between 0 and 100 or length(trim(coalesce(p_reason,''))) < 10 then raise exception 'Valid final score and reason are required'; end if;
  update public.evaluation_result_adjustments set final_score=v_score, final_grade=null, reason=trim(p_reason),workflow_status='second_stage_adjusted',second_stage_by=p_actor_id,second_stage_at=now(),updated_at=now() where id=v_record.id;
  insert into public.evaluation_adjustment_workflow_audit (adjustment_id,cycle_id,target_id,stage,actor_role,action,previous_score,next_score,reason,acted_by,acted_at) values (v_record.id,p_cycle_id,p_target_id,2,'executive','approved',v_record.final_score,v_score,trim(p_reason),p_actor_id,now());
  return jsonb_build_object('adjustment_id',v_record.id,'workflow_status','second_stage_adjusted');
end $$;

create or replace function public.governance_cancel_adjustment(p_cycle_id bigint, p_target_id bigint, p_reason text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_record public.evaluation_result_adjustments;
begin
  v_role := public.governance_actor_role(p_actor_id); if v_role <> '관리자' then raise exception 'Administrator role required'; end if;
  perform public.governance_require_open_cycle(p_cycle_id);
  if length(trim(coalesce(p_reason,''))) < 10 then raise exception 'Cancellation reason is required'; end if;
  select * into v_record from public.evaluation_result_adjustments where cycle_id=p_cycle_id and target_id=p_target_id and status='active' for update;
  if not found then raise exception 'Active adjustment not found'; end if;
  update public.evaluation_result_adjustments set status='cancelled',cancelled_by=p_actor_id,cancelled_at=now(),cancellation_reason=trim(p_reason),updated_at=now() where id=v_record.id;
  insert into public.evaluation_result_adjustment_events (adjustment_id,cycle_id,target_id,event_type,previous_final_score,next_final_score,reason,acted_by,occurred_at) values (v_record.id,p_cycle_id,p_target_id,'cancelled',v_record.final_score,v_record.raw_score,trim(p_reason),p_actor_id,now());
  return jsonb_build_object('adjustment_id',v_record.id,'status','cancelled');
end $$;

create or replace function public.governance_request_approval(p_cycle_id bigint, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_request public.evaluation_cycle_approval_requests;
begin
  v_role := public.governance_actor_role(p_actor_id); if v_role <> '관리자' then raise exception 'Administrator role required'; end if;
  perform 1 from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if not exists (select 1 from public.evaluation_archives where cycle_id=p_cycle_id) then raise exception 'Closed archive required'; end if;
  if exists (select 1 from public.evaluation_result_adjustments where cycle_id=p_cycle_id and status='active' and workflow_status <> 'second_stage_adjusted') then raise exception 'All active adjustments require stage 2 completion'; end if;
  insert into public.evaluation_cycle_approval_requests (cycle_id,request_status,requested_by,requested_at,result_version,created_at,updated_at)
  select p_cycle_id,'requested',p_actor_id,now(),result_version,now(),now() from public.evaluation_cycles where id=p_cycle_id
  returning * into v_request;
  update public.evaluation_cycles set internal_approval_status='requested',result_gate_open=false,updated_at=now() where id=p_cycle_id;
  insert into public.evaluation_cycle_approval_audit (approval_request_id,cycle_id,action,acted_by,acted_at) values (v_request.id,p_cycle_id,'requested',p_actor_id,now());
  return jsonb_build_object('approval_request_id',v_request.id,'status','requested');
end $$;

create or replace function public.governance_decide_approval(p_cycle_id bigint, p_approved boolean, p_reason text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_request public.evaluation_cycle_approval_requests;
begin
  v_role := public.governance_actor_role(p_actor_id); if v_role <> '임원' then raise exception 'Executive role required'; end if;
  perform 1 from public.evaluation_cycles where id=p_cycle_id for update;
  select * into v_request from public.evaluation_cycle_approval_requests where cycle_id=p_cycle_id and request_status='requested' for update;
  if not found then raise exception 'Pending approval request not found'; end if;
  if v_request.result_version is distinct from (select result_version from public.evaluation_cycles where id=p_cycle_id) then raise exception 'Approval request does not match the current result version'; end if;
  update public.evaluation_cycle_approval_requests set request_status=case when p_approved then 'approved' else 'rejected' end,decided_by=p_actor_id,decided_at=now(),decision_note=nullif(trim(coalesce(p_reason,'')),''),updated_at=now() where id=v_request.id;
  update public.evaluation_cycles set internal_approval_status=case when p_approved then 'approved' else 'rejected' end,internal_approval_completed_at=now(),result_gate_open=p_approved,updated_at=now() where id=p_cycle_id;
  insert into public.evaluation_cycle_approval_audit (approval_request_id,cycle_id,action,note,acted_by,acted_at) values (v_request.id,p_cycle_id,case when p_approved then 'approved' else 'rejected' end,nullif(trim(coalesce(p_reason,'')),''),p_actor_id,now());
  return jsonb_build_object('approval_request_id',v_request.id,'status',case when p_approved then 'approved' else 'rejected' end);
end $$;

create or replace function public.governance_publish_results(p_cycle_id bigint, p_published boolean, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_cycle public.evaluation_cycles;
begin
  v_role := public.governance_actor_role(p_actor_id); if v_role <> '임원' then raise exception 'Executive role required'; end if;
  select * into v_cycle from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if p_published and (v_cycle.status <> '마감/보관됨' or v_cycle.internal_approval_status <> 'approved' or not v_cycle.result_gate_open or not exists (select 1 from public.evaluation_archives where cycle_id=p_cycle_id) or not exists (select 1 from public.evaluation_cycle_approval_requests where cycle_id=p_cycle_id and request_status='approved' and result_version=v_cycle.result_version)) then raise exception 'Approved current result version required before publication'; end if;
  update public.evaluation_cycles set results_published=p_published,updated_at=now() where id=p_cycle_id;
  return jsonb_build_object('cycle_id',p_cycle_id,'published',p_published);
end $$;

create or replace function public.governance_finalize_cycle(
  p_cycle_id bigint,
  p_actor_id uuid,
  p_snapshot jsonb,
  p_final_results jsonb,
  p_cohort_snapshots jsonb,
  p_allocations jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_cycle public.evaluation_cycles; v_version integer; v_archive_id bigint;
begin
  v_role := public.governance_actor_role(p_actor_id);
  if v_role not in ('관리자', '임원') then raise exception 'Administrator or executive role required'; end if;
  select * into v_cycle from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if v_cycle.status = '마감/보관됨' or exists (select 1 from public.evaluation_archives where cycle_id=p_cycle_id) then raise exception 'Cycle has already been finalized'; end if;
  if v_cycle.internal_approval_status <> 'not_requested' then raise exception 'Cycle with approval activity cannot be finalized again'; end if;
  if exists (
    select 1 from public.matchings m
    join public.users evaluator on evaluator.id=m.evaluator_id
    join public.users target on target.id=m.target_id
    where m.cycle_id=p_cycle_id and evaluator.active is true and evaluator.can_evaluate is not false
      and target.active is true and target.is_evaluatee is not false
      and not exists (select 1 from public.evaluations e where e.matching_id=m.id)
  ) then raise exception 'All active matchings must be submitted before finalization'; end if;
  if exists (select 1 from public.evaluation_result_adjustments where cycle_id=p_cycle_id and status='active' and workflow_status <> 'second_stage_adjusted') then raise exception 'All active adjustments require stage 2 completion'; end if;
  if jsonb_array_length(coalesce(p_snapshot, '[]'::jsonb)) = 0 or jsonb_array_length(coalesce(p_final_results, '[]'::jsonb)) = 0 then raise exception 'Final snapshot and results are required'; end if;

  v_version := v_cycle.result_version + 1;
  insert into public.evaluation_archives (cycle_id,cycle_name,closed_by,closed_by_name,closed_at,snapshot)
  values (p_cycle_id,v_cycle.name,p_actor_id,'governance finalize',now(),p_snapshot)
  returning id into v_archive_id;
  insert into public.evaluation_final_results (cycle_id,target_id,result_version,cohort_key,raw_score,effective_score,relative_grade,category_labels,created_at)
  select p_cycle_id,(row->>'target_id')::bigint,v_version,row->>'cohort_key',(row->>'raw_score')::numeric,(row->>'effective_score')::numeric,row->>'relative_grade',coalesce(row->'category_labels','[]'::jsonb),now()
  from jsonb_array_elements(p_final_results) row;
  insert into public.evaluation_cohort_snapshots (cycle_id,target_id,cohort_key,company,dept,workplace,role,employee_type,profile_snapshot,captured_by,captured_at)
  select p_cycle_id,(row->>'target_id')::bigint,row->>'cohort_key',row->>'company',row->>'dept',row->>'workplace',row->>'role',row->>'employee_type',coalesce(row->'profile_snapshot','{}'::jsonb),p_actor_id,now()
  from jsonb_array_elements(coalesce(p_cohort_snapshots,'[]'::jsonb)) row
  on conflict (cycle_id,target_id) do nothing;
  insert into public.evaluation_grade_allocations (cycle_id,cohort_key,grade,allocation_count,allocation_ratio,allocated_by,allocated_at)
  select p_cycle_id,row->>'cohort_key',row->>'grade',(row->>'allocation_count')::integer,(row->>'allocation_ratio')::numeric,p_actor_id,now()
  from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) row
  on conflict (cycle_id,cohort_key,grade) do update set allocation_count=excluded.allocation_count,allocation_ratio=excluded.allocation_ratio,allocated_by=excluded.allocated_by,allocated_at=excluded.allocated_at;
  update public.evaluation_cycles set status='마감/보관됨',closed_by=p_actor_id,closed_at=now(),result_version=v_version,updated_at=now() where id=p_cycle_id;
  return jsonb_build_object('archive_id',v_archive_id,'result_version',v_version);
end $$;

create or replace function public.claim_evaluation_mail_dispatch(p_cycle_id bigint,p_target_id bigint,p_recipient_email text,p_mail_kind text,p_idempotency_key text,p_result_version integer,p_requested_by uuid,p_retry boolean default false)
returns table(id bigint,dispatch_status text,claimed boolean) language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing public.evaluation_mail_dispatch_audit;
begin
  insert into public.evaluation_mail_dispatch_audit (cycle_id,target_id,recipient_email,mail_kind,idempotency_key,result_version,requested_by,dispatch_status) values (p_cycle_id,p_target_id,p_recipient_email,p_mail_kind,p_idempotency_key,p_result_version,p_requested_by,'queued') on conflict (idempotency_key) do nothing returning evaluation_mail_dispatch_audit.id,evaluation_mail_dispatch_audit.dispatch_status,true into id,dispatch_status,claimed;
  if found then return next; return; end if;
  select * into v_existing from public.evaluation_mail_dispatch_audit where idempotency_key=p_idempotency_key for update;
  if p_retry and v_existing.dispatch_status='failed' then update public.evaluation_mail_dispatch_audit set dispatch_status='queued',requested_at=now(),dispatched_at=null,error_message=null where id=v_existing.id returning evaluation_mail_dispatch_audit.id,evaluation_mail_dispatch_audit.dispatch_status,true into id,dispatch_status,claimed; else id:=v_existing.id; dispatch_status:=v_existing.dispatch_status; claimed:=false; end if;
  return next;
end $$;

create or replace function public.executive_list_users()
returns table(id bigint,name text,company text,dept text,workplace text,role text,employee_type text,can_evaluate boolean,is_evaluatee boolean,active boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if (select sys_role from public.users where auth_user_id=auth.uid() and active is true) not in ('관리자','임원') then raise exception 'Privileged access required'; end if;
  return query select u.id,u.name,u.company::text,u.dept,u.workplace,u.role,u.type::text,u.can_evaluate,u.is_evaluatee,u.active from public.users u order by u.id;
end $$;

create or replace function public.admin_list_users()
returns setof public.users language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if (select sys_role from public.users where auth_user_id=auth.uid() and active is true) <> '관리자' then raise exception 'Administrator access required'; end if;
  return query select * from public.users order by id;
end $$;

revoke all on function public.governance_actor_role(uuid),public.governance_require_open_cycle(bigint),public.governance_stage1_adjust(bigint,bigint,numeric,numeric,text,uuid),public.governance_stage2_adjust(bigint,bigint,numeric,text,uuid),public.governance_cancel_adjustment(bigint,bigint,text,uuid),public.governance_request_approval(bigint,uuid),public.governance_decide_approval(bigint,boolean,text,uuid),public.governance_publish_results(bigint,boolean,uuid),public.governance_finalize_cycle(bigint,uuid,jsonb,jsonb,jsonb,jsonb),public.claim_evaluation_mail_dispatch(bigint,bigint,text,text,text,integer,uuid,boolean),public.executive_list_users() from public;
grant execute on function public.governance_stage1_adjust(bigint,bigint,numeric,numeric,text,uuid),public.governance_stage2_adjust(bigint,bigint,numeric,text,uuid),public.governance_cancel_adjustment(bigint,bigint,text,uuid),public.governance_request_approval(bigint,uuid),public.governance_decide_approval(bigint,boolean,text,uuid),public.governance_publish_results(bigint,boolean,uuid),public.governance_finalize_cycle(bigint,uuid,jsonb,jsonb,jsonb,jsonb),public.executive_list_users() to authenticated;
grant execute on function public.claim_evaluation_mail_dispatch(bigint,bigint,text,text,text,integer,uuid,boolean) to service_role;
commit;
