begin;

-- Idempotent security rebuild for the production schema inspected on 2026-07-22.
alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.evaluations
  add column if not exists matching_id bigint references public.matchings(id) on delete cascade;

do $$
begin
  if exists (select 1 from public.evaluations where matching_id is null) then
    raise exception 'Map every existing evaluation to matching_id before applying this migration.';
  end if;
end $$;

alter table public.evaluations alter column matching_id set not null;

alter table public.evaluation_questions
  add column if not exists target_track text not null default '湲곕낯 ?꾩닔吏덈Ц',
  add column if not exists target_dept text not null default '?꾩껜',
  add column if not exists required boolean not null default true,
  add column if not exists is_default boolean not null default true,
  add column if not exists max_score numeric not null default 5;

create unique index if not exists users_auth_user_id_uidx
  on public.users (auth_user_id) where auth_user_id is not null;
create unique index if not exists users_email_lower_uidx
  on public.users (lower(email));
drop index if exists public.evaluations_matching_id_uidx;
create unique index evaluations_matching_id_uidx on public.evaluations (matching_id);
create unique index if not exists evaluation_questions_identity_uidx
  on public.evaluation_questions (cycle_id, category, text, target_track, target_dept);

alter table public.evaluation_cycles
  drop constraint if exists valid_cycle_dates;
alter table public.evaluation_cycles
  add constraint valid_cycle_dates check (end_date >= start_date);

alter table public.matchings
  drop constraint if exists prevent_self_evaluation;
alter table public.matchings
  add constraint prevent_self_evaluation check (evaluator_id <> target_id);

alter table public.evaluations
  drop constraint if exists evaluations_perf_score_check,
  drop constraint if exists evaluations_collab_score_check,
  drop constraint if exists evaluations_growth_score_check,
  drop constraint if exists evaluations_harmony_score_check;
alter table public.evaluations
  add constraint evaluations_perf_score_check check (perf_score between 0 and 100),
  add constraint evaluations_collab_score_check check (collab_score between 0 and 100),
  add constraint evaluations_growth_score_check check (growth_score between 0 and 100),
  add constraint evaluations_harmony_score_check check (harmony_score between 0 and 100);

create or replace function public.current_employee_id()
returns bigint language sql stable security definer set search_path = public, pg_temp
as $$
  select id from public.users
  where auth_user_id = auth.uid() and active is true
  limit 1
$$;

create or replace function public.current_user_is_privileged()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select sys_role::text in ('愿由ъ옄', '?꾩썝')
    from public.users
    where auth_user_id = auth.uid() and active is true
    limit 1
  ), false)
$$;

revoke all on function public.current_employee_id() from public;
revoke all on function public.current_user_is_privileged() from public;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.current_user_is_privileged() to authenticated;

alter table public.users enable row level security;
alter table public.evaluation_cycles enable row level security;
alter table public.evaluation_questions enable row level security;
alter table public.matchings enable row level security;
alter table public.evaluations enable row level security;
alter table public.score_adjustments enable row level security;
alter table public.score_adjustment_history enable row level security;

-- Public browser clients must authenticate before they can touch business data.
-- RLS remains the primary authorization layer; these revokes add defense in depth.
revoke all privileges on table public.users from anon;
revoke all privileges on table public.evaluation_cycles from anon;
revoke all privileges on table public.evaluation_questions from anon;
revoke all privileges on table public.matchings from anon;
revoke all privileges on table public.evaluations from anon;
revoke all privileges on table public.score_adjustments from anon;
revoke all privileges on table public.score_adjustment_history from anon;

do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'users','evaluation_cycles','evaluation_questions','matchings',
      'evaluations','score_adjustments','score_adjustment_history'
    )
  loop
    execute format('drop policy if exists %I on %I.%I',
      policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end $$;

create policy users_read_self_or_privileged on public.users
for select to authenticated
using (auth_user_id = auth.uid() or public.current_user_is_privileged());

create policy cycles_read_authenticated on public.evaluation_cycles
for select to authenticated using (true);
create policy questions_read_authenticated on public.evaluation_questions
for select to authenticated using (true);

create policy matchings_read_owner_or_privileged on public.matchings
for select to authenticated
using (evaluator_id = public.current_employee_id() or public.current_user_is_privileged());

create policy evaluations_read_owner_or_privileged on public.evaluations
for select to authenticated
using (
  exists (select 1 from public.matchings m
          where m.id = evaluations.matching_id
            and m.evaluator_id = public.current_employee_id())
  or public.current_user_is_privileged()
);

create policy adjustments_read_privileged on public.score_adjustments
for select to authenticated using (public.current_user_is_privileged());
create policy adjustment_history_read_privileged on public.score_adjustment_history
for select to authenticated using (public.current_user_is_privileged());

create or replace function public.my_profile()
returns setof public.users language sql stable security definer set search_path = public, pg_temp
as $$
  select * from public.users where auth_user_id = auth.uid() and active is true
$$;

create or replace function public.admin_list_users()
returns setof public.users language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.current_user_is_privileged() then
    raise exception 'Administrator access required';
  end if;
  return query select * from public.users order by id;
end $$;

create or replace function public.my_assigned_targets()
returns table (
  matching_id bigint, cycle_id bigint, target_id bigint, name text, dept text,
  workplace text, role text, employee_type text, company text, submitted boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select m.id, m.cycle_id, target.id, target.name, target.dept, target.workplace,
         target.role, target.type::text, target.company::text,
         exists (select 1 from public.evaluations e where e.matching_id = m.id)
  from public.matchings m
  join public.users target on target.id = m.target_id and target.active is true
  join public.evaluation_cycles c on c.id = m.cycle_id
  where m.evaluator_id = public.current_employee_id()
    and current_date between c.start_date and c.end_date
$$;

create or replace function public.submit_evaluation(
  p_matching_id bigint, p_perf_score numeric, p_collab_score numeric,
  p_growth_score numeric, p_harmony_score numeric, p_comment text
)
returns bigint language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_evaluation_id bigint;
begin
  if p_perf_score not between 0 and 100 or p_collab_score not between 0 and 100
     or p_growth_score not between 0 and 100 or p_harmony_score not between 0 and 100 then
    raise exception 'Score must be between 0 and 100';
  end if;
  if length(trim(coalesce(p_comment, ''))) < 50 then
    raise exception 'Comment must contain at least 50 characters';
  end if;
  if not exists (
    select 1 from public.matchings m
    join public.evaluation_cycles c on c.id = m.cycle_id
    join public.users evaluator on evaluator.id = m.evaluator_id
    join public.users target on target.id = m.target_id
    where m.id = p_matching_id and evaluator.auth_user_id = auth.uid()
      and evaluator.active is true and target.active is true
      and current_date between c.start_date and c.end_date
  ) then
    raise exception 'The evaluation is not assigned to the current user or the cycle is closed';
  end if;
  insert into public.evaluations (
    matching_id, cycle_id, evaluator_id, target_id, perf_score, collab_score,
    growth_score, harmony_score, qualitative_comment
  )
  select m.id, m.cycle_id, m.evaluator_id, m.target_id, p_perf_score,
         p_collab_score, p_growth_score, p_harmony_score, trim(p_comment)
  from public.matchings m where m.id = p_matching_id
  on conflict (matching_id) do update set
    perf_score = excluded.perf_score, collab_score = excluded.collab_score,
    growth_score = excluded.growth_score, harmony_score = excluded.harmony_score,
    qualitative_comment = excluded.qualitative_comment
  returning id into v_evaluation_id;
  return v_evaluation_id;
end $$;

revoke all on function public.my_profile() from public;
revoke all on function public.admin_list_users() from public;
revoke all on function public.my_assigned_targets() from public;
revoke all on function public.submit_evaluation(bigint,numeric,numeric,numeric,numeric,text) from public;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.my_assigned_targets() to authenticated;
grant execute on function public.submit_evaluation(bigint,numeric,numeric,numeric,numeric,text) to authenticated;

do $$
begin
  if to_regclass('public.cnhy_system_state') is not null then
    execute 'revoke all on table public.cnhy_system_state from anon, authenticated';
  end if;
end $$;

commit;

