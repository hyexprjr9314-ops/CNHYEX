begin;

alter table public.evaluation_cycles
  alter column auto_matching_enabled set default false;

create or replace function public.governance_replace_auto_matchings(
  p_cycle_id bigint,
  p_matchings jsonb,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_count integer;
begin
  perform public.assert_cycle_governance_actor(p_actor_id, false);
  if jsonb_typeof(coalesce(p_matchings, '[]'::jsonb)) <> 'array' then
    raise exception 'Matchings must be an array';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_matchings, '[]'::jsonb))
      as x(evaluator_id bigint, target_id bigint, relationship_type text)
    where x.evaluator_id is null
       or x.target_id is null
       or x.evaluator_id = x.target_id
       or x.relationship_type not in ('internal', 'exchange', 'leadership')
  ) then
    raise exception 'Invalid automatic matching';
  end if;

  select * into v_cycle
  from public.evaluation_cycles
  where id = p_cycle_id
  for update;
  if not found
     or v_cycle.status::text <> '초안'
     or v_cycle.internal_approval_status <> 'not_requested' then
    raise exception 'Automatic matching is allowed only for an unapproved draft cycle';
  end if;

  perform set_config('app.paused_matching_change', 'allowed', true);

  delete from public.matchings m
  where m.cycle_id = p_cycle_id
    and m.type = '알고리즘 자동 지정'
    and not exists (select 1 from public.evaluations e where e.matching_id = m.id)
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_matchings, '[]'::jsonb))
        as x(evaluator_id bigint, target_id bigint, relationship_type text)
      where x.evaluator_id = m.evaluator_id and x.target_id = m.target_id
    );

  update public.matchings m
  set relationship_type = x.relationship_type,
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_matchings, '[]'::jsonb))
    as x(evaluator_id bigint, target_id bigint, relationship_type text)
  where m.cycle_id = p_cycle_id
    and m.type = '알고리즘 자동 지정'
    and m.evaluator_id = x.evaluator_id
    and m.target_id = x.target_id
    and not exists (select 1 from public.evaluations e where e.matching_id = m.id);

  insert into public.matchings
    (cycle_id, evaluator_id, target_id, type, relationship_type, updated_at)
  select p_cycle_id, x.evaluator_id, x.target_id, '알고리즘 자동 지정',
         x.relationship_type, now()
  from jsonb_to_recordset(coalesce(p_matchings, '[]'::jsonb))
    as x(evaluator_id bigint, target_id bigint, relationship_type text)
  where not exists (
    select 1 from public.matchings m
    where m.cycle_id = p_cycle_id
      and m.evaluator_id = x.evaluator_id
      and m.target_id = x.target_id
  );

  select count(*) into v_count
  from public.matchings
  where cycle_id = p_cycle_id and type = '알고리즘 자동 지정';

  return jsonb_build_object('cycle_id', p_cycle_id, 'automatic_count', v_count);
end
$$;

revoke all on function public.governance_replace_auto_matchings(bigint, jsonb, uuid) from public;
grant execute on function public.governance_replace_auto_matchings(bigint, jsonb, uuid) to authenticated;

commit;
