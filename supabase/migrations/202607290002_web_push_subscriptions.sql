begin;

alter table public.push_device_tokens
  drop constraint if exists push_device_tokens_platform_check;

alter table public.push_device_tokens
  add constraint push_device_tokens_platform_check
  check (platform in ('android', 'web'));

commit;
