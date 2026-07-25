begin;

-- Add the new employee-type labels without rewriting historical profiles.
do $$
declare
  v_schema text;
  v_type text;
begin
  select namespace.nspname, enum_type.typname
    into v_schema, v_type
  from pg_attribute attribute
  join pg_class relation on relation.oid = attribute.attrelid
  join pg_namespace relation_namespace on relation_namespace.oid = relation.relnamespace
  join pg_type enum_type on enum_type.oid = attribute.atttypid
  join pg_namespace namespace on namespace.oid = enum_type.typnamespace
  where relation_namespace.nspname = 'public'
    and relation.relname = 'users'
    and attribute.attname = 'type'
    and enum_type.typtype = 'e';

  if v_type is not null then
    execute format('alter type %I.%I add value if not exists %L', v_schema, v_type, '팀장/부서장급');
    execute format('alter type %I.%I add value if not exists %L', v_schema, v_type, '정비사');
  end if;
end
$$;

-- Question sets are selected only from the evaluatee employee type.
-- Role, department and workplace remain profile/display data.
create or replace function public.canonical_question_track_for_profile(
  p_employee_type text, p_role text, p_dept text, p_workplace text
)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case trim(coalesce(p_employee_type, ''))
    when '팀장/부서장급' then 'headquarters_leader'
    when '팀장급' then 'headquarters_leader'
    when '부서실장급' then 'headquarters_leader'
    when '정비사' then 'mechanic'
    else 'headquarters_member'
  end
$$;

create or replace function public.canonical_question_track_alias(p_track text)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case trim(coalesce(p_track, ''))
    when '' then 'all'
    when 'all' then 'all'
    when '기본 필수질문' then 'all'
    when '전사 공통' then 'all'
    when '본사 팀원급' then 'headquarters_member'
    when '팀원급' then 'headquarters_member'
    when 'headquarters_member' then 'headquarters_member'
    when '영업소' then 'headquarters_member'
    when '영업소 직원' then 'headquarters_member'
    when 'branch_employee' then 'headquarters_member'
    when '팀장/부서장급' then 'headquarters_leader'
    when '팀장·부서장급' then 'headquarters_leader'
    when '팀장급' then 'headquarters_leader'
    when 'headquarters_leader' then 'headquarters_leader'
    when '정비사' then 'mechanic'
    when 'mechanic' then 'mechanic'
    else lower(trim(p_track))
  end
$$;

create or replace function public.my_assigned_questions(p_matching_id bigint)
returns table (
  id bigint, cycle_id bigint, category text, text text, weight numeric,
  type text, target_track text, target_dept text, audience text,
  required boolean, is_default boolean, max_score numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with assignment as (
    select m.cycle_id,
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) as target_track
    from public.matchings m
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    join public.evaluation_cycles cycle on cycle.id = m.cycle_id
    where m.id = p_matching_id
      and evaluator.auth_user_id = auth.uid()
      and evaluator.active is true and evaluator.can_evaluate is true
      and target.active is true and target.is_evaluatee is true
      and target.type::text not in ('임원급', '임원')
      and current_date between cycle.start_date and cycle.deadline
      and cycle.status = '진행중'
  )
  select question.id, question.cycle_id, question.category, question.text,
         question.weight, question.type, question.target_track,
         question.target_dept, question.audience, question.required,
         question.is_default, question.max_score
  from public.evaluation_questions question
  join assignment on assignment.cycle_id = question.cycle_id
  where public.question_track_applies(question.target_track, assignment.target_track)
  order by question.id
$$;

-- Preflight uses the same cycle + evaluatee-track rule as the live form.
create or replace function public.validate_cycle_question_coverage(p_cycle_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  with tracks as (
    select distinct
      public.canonical_question_track_for_profile(target.type::text, target.role, target.dept, target.workplace) target_track
    from public.matchings matching
    join public.users target on target.id = matching.target_id
    where matching.cycle_id = p_cycle_id
      and target.active is true
      and target.is_evaluatee is true
      and target.type::text not in ('임원급', '임원')
  ), required_categories as (
    select track.target_track, unnest(case track.target_track
      when 'headquarters_member' then array['성과','협업','성장','조화']
      when 'headquarters_leader' then array['리더십','팀원 육성','소통','전략적 사고']
      when 'mechanic' then array['역량 개발','정비 능력','책임/주인의식','안전의식']
    end) category
    from tracks track
  ), missing as (
    select required.*
    from required_categories required
    where not exists (
      select 1
      from public.evaluation_questions question
      where question.cycle_id = p_cycle_id
        and question.category = required.category
        and coalesce(question.type, '') <> '서술형'
        and coalesce(question.weight, 0) > 0
        and coalesce(question.max_score, 0) > 0
        and public.question_track_applies(question.target_track, required.target_track)
    )
  ), issues as (
    select
      'QUESTION_COVERAGE_MISSING' code,
      target_track,
      category,
      format('%s: %s 질문이 없습니다.', target_track, category) message
    from missing
    union all
    select distinct
      'EXECUTIVE_TARGET_ASSIGNED',
      'executive',
      null::text,
      '임원급 인원은 직접 평가 대상에 포함할 수 없습니다.'
    from public.matchings matching
    join public.users target on target.id = matching.target_id
    where matching.cycle_id = p_cycle_id
      and target.type::text in ('임원급', '임원')
  )
  select jsonb_build_object(
    'ok', not exists(select 1 from issues),
    'issues', coalesce(jsonb_agg(jsonb_build_object(
      'code', code,
      'target_track', target_track,
      'category', category,
      'message', message
    )), '[]'::jsonb)
  )
  from issues
$$;

-- Paused question edits are safe only before the first submitted evaluation.
create or replace function public.prevent_non_draft_cycle_source_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle_ids bigint[];
  v_cycle_id bigint;
  v_status text;
  v_approval_status text;
begin
  if current_setting('app.cycle_hard_delete', true) = 'allowed' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_cycle_ids := array[new.cycle_id];
  elsif tg_op = 'DELETE' then
    v_cycle_ids := array[old.cycle_id];
  else
    v_cycle_ids := array[old.cycle_id, new.cycle_id];
  end if;

  foreach v_cycle_id in array v_cycle_ids loop
    select status::text, internal_approval_status
      into v_status, v_approval_status
    from public.evaluation_cycles
    where id = v_cycle_id;

    if v_status = '초안' then
      continue;
    end if;

    if tg_table_name = 'evaluation_questions'
       and v_status = '일시정지'
       and v_approval_status = 'not_requested'
       and not exists (
         select 1 from public.evaluations evaluation
         where evaluation.cycle_id = v_cycle_id
       ) then
      continue;
    end if;

    if tg_table_name = 'matchings'
       and v_status = '일시정지'
       and current_setting('app.paused_matching_change', true) = 'allowed' then
      continue;
    end if;

    raise exception 'Questions and matchings are locked for this evaluation cycle state';
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function public.canonical_question_track_for_profile(text,text,text,text) from public;
revoke all on function public.canonical_question_track_alias(text) from public;
revoke all on function public.my_assigned_questions(bigint) from public, anon;
revoke all on function public.validate_cycle_question_coverage(bigint) from public, anon, authenticated;
grant execute on function public.canonical_question_track_for_profile(text,text,text,text) to authenticated, service_role;
grant execute on function public.canonical_question_track_alias(text) to authenticated, service_role;
grant execute on function public.my_assigned_questions(bigint) to authenticated;
grant execute on function public.validate_cycle_question_coverage(bigint) to service_role;

commit;
