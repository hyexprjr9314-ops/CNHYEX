begin;

create or replace function public.prevent_non_draft_cycle_source_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle_id bigint;
  v_status text;
begin
  if current_setting('app.cycle_hard_delete', true) = 'allowed' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_cycle_id := coalesce(new.cycle_id, old.cycle_id);
  select status::text into v_status
  from public.evaluation_cycles
  where id = v_cycle_id;

  if v_status = '초안' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'matchings'
     and v_status = '일시정지'
     and current_setting('app.paused_matching_change', true) = 'allowed' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  raise exception 'Questions and matchings are immutable outside draft; paused matching changes require the governance RPC';
end
$$;

create or replace function public.governance_hard_delete_cycle(
  p_cycle_id bigint,
  p_reason text,
  p_confirmation text,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_reason text;
begin
  perform public.assert_cycle_governance_actor(p_actor_id, true);
  v_reason := public.assert_cycle_governance_reason(p_reason);

  select * into v_cycle
  from public.evaluation_cycles
  where id = p_cycle_id
  for update;

  if not found then raise exception 'Evaluation cycle not found'; end if;
  if v_cycle.status::text not in ('마감/보관됨', '취소/보관됨') then
    raise exception 'Only a closed or cancelled cycle can be permanently deleted';
  end if;
  if p_confirmation is distinct from v_cycle.name then
    raise exception 'Evaluation cycle name confirmation does not match';
  end if;

  insert into public.evaluation_cycle_governance_audit
    (cycle_id, cycle_id_snapshot, cycle_name, action, reason, previous_status, next_status, acted_by)
  values
    (p_cycle_id, p_cycle_id, v_cycle.name, 'hard_deleted', v_reason, v_cycle.status, null, p_actor_id);

  perform set_config('app.cycle_hard_delete', 'allowed', true);
  delete from public.evaluation_final_results where cycle_id = p_cycle_id;
  delete from public.evaluation_archives where cycle_id = p_cycle_id;
  delete from public.evaluation_cycles where id = p_cycle_id;

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'cycle_name', v_cycle.name,
    'deleted', true
  );
end
$$;

revoke all on function public.governance_hard_delete_cycle(bigint, text, text, uuid)
from public;

grant execute on function public.governance_hard_delete_cycle(bigint, text, text, uuid)
to authenticated;

commit;
