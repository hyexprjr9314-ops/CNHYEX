-- Replace a draft evaluator's assignments atomically.
-- Draft matching edits use the same governance boundary as paused edits so a
-- delete cannot commit without its corresponding insert/upsert.

create or replace function public.governance_replace_draft_matchings(
  p_cycle_id bigint,
  p_evaluator_id bigint,
  p_targets jsonb,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.assert_cycle_governance_actor(p_actor_id, false);
  if jsonb_typeof(coalesce(p_targets, '[]'::jsonb)) <> 'array' then
    raise exception 'Targets must be an array';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
      as x(target_id bigint, relationship_type text)
    where x.target_id is null
       or x.target_id = p_evaluator_id
       or x.relationship_type not in ('internal', 'exchange', 'leadership')
  ) then
    raise exception 'Invalid matching target';
  end if;

  select * into v_cycle
  from public.evaluation_cycles
  where id = p_cycle_id
  for update;
  if not found
     or v_cycle.status::text <> '초안'
     or v_cycle.internal_approval_status <> 'not_requested' then
    raise exception 'Only a draft cycle without approval activity can be rematched';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
    into v_before
  from public.matchings m
  where m.cycle_id = p_cycle_id and m.evaluator_id = p_evaluator_id;

  perform set_config('app.paused_matching_change', 'allowed', true);

  delete from public.matchings m
  where m.cycle_id = p_cycle_id
    and m.evaluator_id = p_evaluator_id
    and not exists (select 1 from public.evaluations e where e.matching_id = m.id)
    and not exists (
      select 1 from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
        as x(target_id bigint, relationship_type text)
      where x.target_id = m.target_id
    );

  update public.matchings m
  set type = '관리자 수동 지정',
      relationship_type = x.relationship_type,
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
    as x(target_id bigint, relationship_type text)
  where m.cycle_id = p_cycle_id
    and m.evaluator_id = p_evaluator_id
    and m.target_id = x.target_id
    and not exists (select 1 from public.evaluations e where e.matching_id = m.id);

  insert into public.matchings
    (cycle_id, evaluator_id, target_id, type, relationship_type, updated_at)
  select p_cycle_id, p_evaluator_id, x.target_id, '관리자 수동 지정',
         x.relationship_type, now()
  from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
    as x(target_id bigint, relationship_type text)
  where not exists (
    select 1 from public.matchings m
    where m.cycle_id = p_cycle_id
      and m.evaluator_id = p_evaluator_id
      and m.target_id = x.target_id
  );

  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
    into v_after
  from public.matchings m
  where m.cycle_id = p_cycle_id and m.evaluator_id = p_evaluator_id;

  insert into public.evaluation_matching_change_audit
    (cycle_id, evaluator_id, action, reason, before_state, after_state, acted_by)
  values (p_cycle_id, p_evaluator_id, 'replaced', 'draft matching replace', v_before, v_after, p_actor_id);

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'evaluator_id', p_evaluator_id,
    'matchings', v_after
  );
end
$$;

revoke all on function public.governance_replace_draft_matchings(bigint, bigint, jsonb, uuid) from public;
grant execute on function public.governance_replace_draft_matchings(bigint, bigint, jsonb, uuid) to authenticated;
