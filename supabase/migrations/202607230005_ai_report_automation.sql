begin;

alter table public.ai_evaluation_reports
  add column if not exists source_hash text,
  add column if not exists hidden boolean not null default false;

create table if not exists public.ai_report_generation_jobs (
  cycle_id bigint not null references public.evaluation_cycles(id) on delete cascade,
  target_id bigint not null references public.users(id) on delete cascade,
  source_hash text,
  state text not null default 'waiting'
    check (state in ('waiting','analyzing','completed','stale','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  requested_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (cycle_id, target_id)
);

alter table public.ai_report_generation_jobs enable row level security;
revoke all privileges on table public.ai_report_generation_jobs from anon, authenticated;

-- The browser reads job state through the authenticated Vercel API only.
create index if not exists ai_report_generation_jobs_state_idx
  on public.ai_report_generation_jobs (cycle_id, state);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_report_generation_jobs'
  ) then
    alter publication supabase_realtime add table public.ai_report_generation_jobs;
  end if;
end $$;

commit;
