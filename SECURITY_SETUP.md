# Security setup

1. Back up the Supabase database.
2. Create one bootstrap administrator in Supabase Auth and link its UID to the matching `public.users.auth_user_id`.
3. Apply `supabase/migrations/202607220001_security_rebuild.sql` in a staging project first.
4. Configure the Vercel server environment variables below.
5. Use the administrator CSV screen to create/link the remaining Auth accounts.
6. Test with an employee account, an HR administrator account, and an unauthenticated browser.

Required Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefix with `NEXT_PUBLIC_` or expose it in HTML)

The inspected production database currently has no evaluations or matchings, so no legacy `matching_id` mapping is required. Recheck this immediately before applying the migration.

The browser may contain the Supabase URL and publishable key. Never commit the secret/service-role key, database password, access token, or real employee exports.

Required checks:

- Anonymous requests cannot read any HR table.
- Employees can read only their own profile, assignments, and submissions.
- An employee cannot submit a matching assigned to another employee.
- Closed or future cycles reject submissions.
- Score adjustment tables are readable only by privileged users and writable only through a trusted server operation.
- `/api/users` and `/api/questions` reject callers who are not linked, active administrators.
