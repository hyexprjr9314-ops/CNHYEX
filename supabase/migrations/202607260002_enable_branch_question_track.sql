begin;

create or replace function public.canonical_question_track_for_profile(
  p_employee_type text, p_role text, p_dept text, p_workplace text
)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case
    when trim(coalesce(p_employee_type, '')) = '정비사' then 'mechanic'
    when trim(coalesce(p_employee_type, '')) in ('팀장/부서장급', '팀장급', '부서실장급') then 'headquarters_leader'
    when concat_ws(' ', p_workplace, p_dept) like '%영업소%' then 'branch_employee'
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
    when '영업소' then 'branch_employee'
    when '영업소 직원' then 'branch_employee'
    when 'branch_employee' then 'branch_employee'
    when '팀장/부서장급' then 'headquarters_leader'
    when '팀장·부서장급' then 'headquarters_leader'
    when '팀장급' then 'headquarters_leader'
    when 'headquarters_leader' then 'headquarters_leader'
    when '정비사' then 'mechanic'
    when 'mechanic' then 'mechanic'
    else lower(trim(p_track))
  end
$$;

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
      when 'branch_employee' then array['비상대응','소통 협력','솔선 수범','갈등 해소']
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

revoke all on function public.canonical_question_track_for_profile(text,text,text,text) from public;
revoke all on function public.canonical_question_track_alias(text) from public;
revoke all on function public.validate_cycle_question_coverage(bigint) from public, anon, authenticated;
grant execute on function public.canonical_question_track_for_profile(text,text,text,text) to authenticated, service_role;
grant execute on function public.canonical_question_track_alias(text) to authenticated, service_role;
grant execute on function public.validate_cycle_question_coverage(bigint) to service_role;

commit;
