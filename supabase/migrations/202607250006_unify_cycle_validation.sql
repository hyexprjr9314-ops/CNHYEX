begin;

-- Keep the manual preflight report on the same scope rules used by activation
-- and submission.  The older validator inspected every active evaluatee and
-- hard-coded the legacy four categories, which made valid cycle-scoped
-- questions appear to be missing.
create or replace function public.validate_evaluation_cycle(p_cycle_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles%rowtype;
  v_coverage jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_targets integer := 0;
  v_assignments integer := 0;
  v_questions integer := 0;
  v_invalid_assignments integer := 0;
begin
  select * into v_cycle from public.evaluation_cycles where id = p_cycle_id;
  if not found then raise exception 'Evaluation cycle not found'; end if;

  if v_cycle.end_date < v_cycle.start_date or v_cycle.deadline < v_cycle.end_date then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_DATES', 'message', 'Evaluation dates are invalid.'
    ));
  end if;
  select count(distinct m.target_id) into v_targets
  from public.matchings m
  join public.users t on t.id = m.target_id
  where m.cycle_id = p_cycle_id and t.active is true and t.is_evaluatee is true;

  select count(*) into v_assignments
  from public.matchings where cycle_id = p_cycle_id;

  select count(*) into v_questions
  from public.evaluation_questions
  where cycle_id = p_cycle_id
    and coalesce(type, '') <> '서술형'
    and coalesce(weight, 0) > 0
    and coalesce(max_score, 0) > 0;

  select count(*) into v_invalid_assignments
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  where m.cycle_id = p_cycle_id
    and (m.evaluator_id = m.target_id
      or evaluator.active is not true
      or evaluator.can_evaluate is not true
      or evaluator.auth_user_id is null
      or target.active is not true
      or target.is_evaluatee is not true);

  if v_targets = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'NO_TARGETS', 'message', 'No active evaluation targets are assigned to this cycle.'
    ));
  end if;
  if v_assignments = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'NO_ASSIGNMENTS', 'message', 'No evaluation assignments exist for this cycle.'
    ));
  end if;
  if v_invalid_assignments > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_ASSIGNMENTS',
      'message', format('Invalid evaluation assignments: %s.', v_invalid_assignments)
    ));
  end if;

  v_coverage := public.validate_cycle_question_coverage(p_cycle_id);
  v_issues := v_issues || coalesce(v_coverage->'issues', '[]'::jsonb);

  return jsonb_build_object(
    'ok', jsonb_array_length(v_issues) = 0,
    'cycle_id', p_cycle_id,
    'issues', v_issues,
    'counts', jsonb_build_object(
      'targets', v_targets,
      'assignments', v_assignments,
      'questions', v_questions,
      'invalid_assignments', v_invalid_assignments
    )
  );
end;
$$;

revoke all on function public.validate_evaluation_cycle(bigint) from public, anon, authenticated;
grant execute on function public.validate_evaluation_cycle(bigint) to service_role;

create or replace function public.activate_evaluation_cycle(p_cycle_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles;
  v_report jsonb;
  v_message text;
begin
  select * into v_cycle from public.evaluation_cycles where id = p_cycle_id for update;
  if not found then raise exception 'Evaluation cycle not found'; end if;
  if v_cycle.status is distinct from '초안' then raise exception 'Only draft cycles can be activated'; end if;

  v_report := public.validate_evaluation_cycle(p_cycle_id);
  if coalesce((v_report->>'ok')::boolean, false) is not true then
    select string_agg(item->>'message', E'\n') into v_message
    from jsonb_array_elements(v_report->'issues') item;
    raise exception 'Evaluation cycle activation failed:%',
      E'\n' || coalesce(v_message, 'Cycle validation failed');
  end if;

  perform set_config('app.cycle_status_transition', 'activate', true);
  update public.evaluation_cycles set status = '진행중', updated_at = now() where id = p_cycle_id;
  return v_report || jsonb_build_object('activated', true);
end;
$$;

revoke all on function public.activate_evaluation_cycle(bigint) from public, anon, authenticated;
grant execute on function public.activate_evaluation_cycle(bigint) to service_role;

commit;
