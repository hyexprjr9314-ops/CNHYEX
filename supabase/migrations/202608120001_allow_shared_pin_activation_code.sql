begin;

-- The first-time code is intentionally shared for accessibility. Identity is
-- still scoped by the employee's normalized name, and the token expires after
-- ten minutes and is consumed on successful enrollment.
drop index if exists public.users_pin_enrollment_token_unique;
create index if not exists users_pin_enrollment_token_idx
  on public.users (pin_enrollment_token_hash)
  where pin_enrollment_token_hash is not null;

commit;
