alter table public.users
  add column if not exists pin_login_name text;

update public.users
set pin_login_name = trim(regexp_replace(name, '\s+', ' ', 'g'))
where login_method = 'pin';

update public.users
set pin_enrollment_token_hash = null,
    pin_enrollment_expires_at = null
where login_method = 'pin';

create index if not exists users_pin_login_name_idx
  on public.users (pin_login_name)
  where login_method = 'pin' and active = true;

alter table public.users drop constraint if exists users_pin_login_name_required;
alter table public.users add constraint users_pin_login_name_required
  check (login_method <> 'pin' or nullif(trim(pin_login_name), '') is not null);
