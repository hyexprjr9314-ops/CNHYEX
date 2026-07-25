begin;

create or replace function public.governance_publish_results(
  p_cycle_id bigint, p_published boolean, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cycle public.evaluation_cycles; v_role text;
begin
  v_role := public.governance_actor_role(p_actor_id);
  if v_role not in ('관리자', '임원') then
    raise exception 'Administrator or executive role required';
  end if;
  select * into v_cycle from public.evaluation_cycles where id=p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if p_published and (
    v_cycle.status <> '마감/보관됨' or v_cycle.internal_approval_status <> 'approved'
    or not v_cycle.result_gate_open
    or not exists (
      select 1 from public.evaluation_final_results r
      where r.cycle_id=p_cycle_id and r.result_version=v_cycle.result_version
    )
    or not exists (
      select 1 from public.evaluation_cycle_approval_requests q
      where q.cycle_id=p_cycle_id and q.request_status='approved'
        and q.result_version=v_cycle.result_version
    )
  ) then
    raise exception 'Approved current result version required before publication';
  end if;
  update public.evaluation_cycles
    set results_published=p_published,updated_at=now()
    where id=p_cycle_id;
  insert into public.evaluation_cycle_approval_audit
    (cycle_id,action,note,acted_by,acted_at)
  values (
    p_cycle_id,
    case when p_published then 'gate_opened' else 'gate_closed' end,
    case when p_published then 'Results published' else 'Results unpublished' end,
    p_actor_id,
    now()
  );
  return jsonb_build_object(
    'cycle_id',p_cycle_id,
    'published',p_published,
    'result_version',v_cycle.result_version
  );
end $$;

revoke all on function public.governance_publish_results(bigint,boolean,uuid) from public;
grant execute on function public.governance_publish_results(bigint,boolean,uuid) to authenticated;

commit;
