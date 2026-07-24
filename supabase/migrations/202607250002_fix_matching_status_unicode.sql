-- Repair Korean lifecycle literals corrupted in the paused-matching migration.

create or replace function public.prevent_non_draft_cycle_source_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle_id bigint;
  v_status text;
begin
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

create or replace function public.governance_toggle_paused_matching(
  p_cycle_id bigint,
  p_evaluator_id bigint,
  p_target_id bigint,
  p_relationship_type text,
  p_reason text,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_existing public.matchings;
  v_reason text;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_inserted public.matchings;
  v_exists boolean;
begin
  perform public.assert_cycle_governance_actor(p_actor_id, false);
  v_reason := public.assert_cycle_governance_reason(p_reason);
  if p_evaluator_id = p_target_id then raise exception 'Self matching is not allowed'; end if;
  if p_relationship_type not in ('internal', 'exchange', 'leadership') then
    raise exception 'Invalid relationship type';
  end if;

  select * into v_cycle
  from public.evaluation_cycles
  where id = p_cycle_id
  for update;
  if not found
     or v_cycle.status::text <> '일시정지'
     or v_cycle.internal_approval_status <> 'not_requested' then
    raise exception 'Only a paused cycle without approval activity can be rematched';
  end if;

  select * into v_existing
  from public.matchings
  where cycle_id = p_cycle_id
    and evaluator_id = p_evaluator_id
    and target_id = p_target_id
  for update;
  v_exists := found;
  v_before := case when v_exists then jsonb_build_array(to_jsonb(v_existing)) else '[]'::jsonb end;

  perform set_config('app.paused_matching_change', 'allowed', true);
  if v_exists then
    if exists (select 1 from public.evaluations where matching_id = v_existing.id) then
      raise exception 'A submitted matching cannot be removed';
    end if;
    delete from public.matchings where id = v_existing.id;
    v_after := '[]'::jsonb;
    v_action := 'removed';
  else
    insert into public.matchings
      (cycle_id, evaluator_id, target_id, type, relationship_type, updated_at)
    values
      (p_cycle_id, p_evaluator_id, p_target_id, '관리자 수동 지정', p_relationship_type, now())
    returning * into v_inserted;
    v_after := jsonb_build_array(to_jsonb(v_inserted));
    v_action := 'added';
  end if;

  insert into public.evaluation_matching_change_audit
    (cycle_id, evaluator_id, action, reason, before_state, after_state, acted_by)
  values
    (p_cycle_id, p_evaluator_id, v_action, v_reason, v_before, v_after, p_actor_id);

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'evaluator_id', p_evaluator_id,
    'action', v_action
  );
end
$$;

create or replace function public.governance_replace_paused_matchings(
  p_cycle_id bigint,
  p_evaluator_id bigint,
  p_targets jsonb,
  p_reason text,
  p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_reason text;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.assert_cycle_governance_actor(p_actor_id, false);
  v_reason := public.assert_cycle_governance_reason(p_reason);
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
     or v_cycle.status::text <> '일시정지'
     or v_cycle.internal_approval_status <> 'not_requested' then
    raise exception 'Only a paused cycle without approval activity can be rematched';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
  into v_before
  from public.matchings m
  where m.cycle_id = p_cycle_id
    and m.evaluator_id = p_evaluator_id;

  perform set_config('app.paused_matching_change', 'allowed', true);

  delete from public.matchings m
  where m.cycle_id = p_cycle_id
    and m.evaluator_id = p_evaluator_id
    and not exists (
      select 1 from public.evaluations e where e.matching_id = m.id
    )
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
        as x(target_id bigint, relationship_type text)
      where x.target_id = m.target_id
    );

  insert into public.matchings
    (cycle_id, evaluator_id, target_id, type, relationship_type, updated_at)
  select
    p_cycle_id,
    p_evaluator_id,
    x.target_id,
    '관리자 수동 지정',
    x.relationship_type,
    now()
  from jsonb_to_recordset(coalesce(p_targets, '[]'::jsonb))
    as x(target_id bigint, relationship_type text)
  where not exists (
    select 1
    from public.matchings m
    where m.cycle_id = p_cycle_id
      and m.evaluator_id = p_evaluator_id
      and m.target_id = x.target_id
  );

  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
  into v_after
  from public.matchings m
  where m.cycle_id = p_cycle_id
    and m.evaluator_id = p_evaluator_id;

  insert into public.evaluation_matching_change_audit
    (cycle_id, evaluator_id, action, reason, before_state, after_state, acted_by)
  values
    (p_cycle_id, p_evaluator_id, 'replaced', v_reason, v_before, v_after, p_actor_id);

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'evaluator_id', p_evaluator_id,
    'matchings', v_after
  );
end
$$;

