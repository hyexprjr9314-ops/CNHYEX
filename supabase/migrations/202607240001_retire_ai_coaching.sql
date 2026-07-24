begin;

-- AI coaching is retired. Keep historical rows for audit/rollback purposes,
-- but prevent browser clients from reading or mutating them.
drop policy if exists ai_reports_read_approved_self_or_privileged
  on public.ai_evaluation_reports;

revoke all privileges on table public.ai_evaluation_reports
  from anon, authenticated;
revoke all privileges on table public.ai_report_generation_jobs
  from anon, authenticated;

-- No clients subscribe to generation jobs after retirement.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_report_generation_jobs'
  ) then
    alter publication supabase_realtime
      drop table public.ai_report_generation_jobs;
  end if;
end $$;

comment on table public.ai_evaluation_reports is
  'Retired AI coaching report history retained for audit and rollback only.';
comment on table public.ai_report_generation_jobs is
  'Retired AI generation job history retained for audit and rollback only.';

commit;
