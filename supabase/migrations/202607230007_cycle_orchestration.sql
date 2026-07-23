begin;

create or replace function public.validate_evaluation_cycle(p_cycle_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle public.evaluation_cycles%rowtype;
  v_issues jsonb := '[]'::jsonb;
  v_target record;
  v_category text;
  v_track text;
  v_assignment_count integer := 0;
  v_target_count integer := 0;
  v_question_count integer := 0;
  v_invalid_assignment_count integer := 0;
begin
  select * into v_cycle
  from public.evaluation_cycles
  where id = p_cycle_id;

  if not found then
    raise exception '평가 주기를 찾을 수 없습니다.';
  end if;

  if v_cycle.end_date < v_cycle.start_date or v_cycle.deadline < v_cycle.end_date then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_DATES',
      'message', '평가 종료일과 마감일을 다시 확인해 주세요.'
    ));
  end if;

  if current_date < v_cycle.start_date or current_date > v_cycle.deadline then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'OUTSIDE_PERIOD',
      'message', format('오늘은 평가 가능 기간(%s ~ %s)이 아닙니다.', v_cycle.start_date, v_cycle.deadline)
    ));
  end if;

  select count(*) into v_target_count
  from public.users
  where active is true and is_evaluatee is true;

  if v_target_count = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'NO_TARGETS',
      'message', '활성화된 피평가 대상자가 없습니다.'
    ));
  end if;

  select count(*) into v_assignment_count
  from public.matchings
  where cycle_id = p_cycle_id;

  if v_assignment_count = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'NO_ASSIGNMENTS',
      'message', '이 평가주기에 생성된 평가 배정이 없습니다.'
    ));
  end if;

  select count(*) into v_invalid_assignment_count
  from public.matchings m
  join public.users evaluator on evaluator.id = m.evaluator_id
  join public.users target on target.id = m.target_id
  where m.cycle_id = p_cycle_id
    and (
      m.evaluator_id = m.target_id
      or evaluator.active is not true
      or evaluator.can_evaluate is not true
      or evaluator.auth_user_id is null
      or target.active is not true
      or target.is_evaluatee is not true
    );

  if v_invalid_assignment_count > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_ASSIGNMENTS',
      'message', format('로그인 연결·권한·활성 상태가 잘못된 평가 배정이 %s건 있습니다.', v_invalid_assignment_count)
    ));
  end if;

  for v_target in
    select id, name, dept, workplace, role, type::text as type
    from public.users
    where active is true and is_evaluatee is true
    order by id
  loop
    if not exists (
      select 1
      from public.matchings m
      join public.users evaluator on evaluator.id = m.evaluator_id
      where m.cycle_id = p_cycle_id
        and m.target_id = v_target.id
        and m.evaluator_id <> v_target.id
        and evaluator.active is true
        and evaluator.can_evaluate is true
        and evaluator.auth_user_id is not null
    ) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'TARGET_UNASSIGNED',
        'target_id', v_target.id,
        'message', format('%s: 유효한 평가자가 배정되지 않았습니다.', v_target.name)
      ));
      continue;
    end if;

    v_track := case
      when coalesce(v_target.dept, '') like '%정비%' then '정비사'
      when v_target.type = '팀장급'
        or coalesce(v_target.role, '') like '%팀장%'
        or coalesce(v_target.role, '') like '%부장%' then '팀장/부서장급'
      when coalesce(v_target.workplace, '') like '%영업소%'
        or coalesce(v_target.dept, '') like '%영업소%' then '영업소'
      else '본사 팀원급'
    end;

    foreach v_category in array array['성과','협업','성장','조화'] loop
      if not exists (
        select 1
        from public.evaluation_questions q
        where q.cycle_id = p_cycle_id
          and q.category = v_category
          and coalesce(q.type, '') <> '서술형'
          and coalesce(q.weight, 0) > 0
          and coalesce(q.max_score, 0) > 0
          and (q.target_track = '기본 필수질문' or q.target_track = v_track)
          and (
            q.target_dept is null
            or q.target_dept = '전체'
            or coalesce(v_target.dept, '') like '%' || q.target_dept || '%'
          )
      ) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'QUESTION_COVERAGE_MISSING',
          'target_id', v_target.id,
          'category', v_category,
          'message', format('%s: %s 영역의 유효한 5지선다 질문이 없습니다.', v_target.name, v_category)
        ));
      end if;
    end loop;
  end loop;

  select count(*) into v_question_count
  from public.evaluation_questions
  where cycle_id = p_cycle_id
    and coalesce(type, '') <> '서술형'
    and coalesce(weight, 0) > 0
    and coalesce(max_score, 0) > 0;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_issues) = 0,
    'cycle_id', p_cycle_id,
    'issues', v_issues,
    'counts', jsonb_build_object(
      'targets', v_target_count,
      'assignments', v_assignment_count,
      'questions', v_question_count,
      'invalid_assignments', v_invalid_assignment_count
    )
  );
end;
$$;

create or replace function public.activate_evaluation_cycle(p_cycle_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report jsonb;
  v_messages text;
begin
  perform 1
  from public.evaluation_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception '평가 주기를 찾을 수 없습니다.';
  end if;

  v_report := public.validate_evaluation_cycle(p_cycle_id);
  if coalesce((v_report->>'ok')::boolean, false) is not true then
    select string_agg(item->>'message', E'\n')
      into v_messages
    from jsonb_array_elements(v_report->'issues') item;
    raise exception '평가주기 시작 전 점검 실패:%', E'\n' || coalesce(v_messages, '알 수 없는 설정 오류');
  end if;

  update public.evaluation_cycles
  set status = '진행중',
      updated_at = now()
  where id = p_cycle_id;

  return v_report || jsonb_build_object('activated', true);
end;
$$;

revoke all on function public.validate_evaluation_cycle(bigint) from public, anon, authenticated;
revoke all on function public.activate_evaluation_cycle(bigint) from public, anon, authenticated;
grant execute on function public.validate_evaluation_cycle(bigint) to service_role;
grant execute on function public.activate_evaluation_cycle(bigint) to service_role;

commit;
