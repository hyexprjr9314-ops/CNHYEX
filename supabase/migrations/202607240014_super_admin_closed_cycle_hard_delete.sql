begin;

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
  if v_cycle.status <> '마감/보관됨' then
    raise exception 'Only a closed or cancelled cycle can be permanently deleted';
  end if;
  if p_confirmation is distinct from v_cycle.name then
    raise exception 'Evaluation cycle name confirmation does not match';
  end if;

  insert into public.evaluation_cycle_governance_audit
    (cycle_id, cycle_id_snapshot, cycle_name, action, reason, previous_status, next_status, acted_by)
  values
    (p_cycle_id, p_cycle_id, v_cycle.name, 'hard_deleted', v_reason, v_cycle.status, null, p_actor_id);

  -- These two historical tables intentionally restrict parent deletion.
  -- All other cycle-owned records cascade or detach through their FK rules.
  delete from public.evaluation_final_results where cycle_id = p_cycle_id;
  delete from public.evaluation_archives where cycle_id = p_cycle_id;
  delete from public.evaluation_cycles where id = p_cycle_id;

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'cycle_name', v_cycle.name,
    'deleted', true
  );
end $$;

revoke all on function public.governance_hard_delete_cycle(bigint, text, text, uuid)
from public;

grant execute on function public.governance_hard_delete_cycle(bigint, text, text, uuid)
to authenticated;

commit;
