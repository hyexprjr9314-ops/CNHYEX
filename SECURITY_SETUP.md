# Security setup

1. Back up the Supabase database.
2. Link every active `public.users` row to the matching Supabase Auth user in `auth_user_id`.
3. Map legacy `public.evaluations` rows to a valid `matching_id`.
4. Apply `supabase/migrations/202607220001_security_rebuild.sql` in a staging project first.
5. Test with an employee account, an HR administrator account, and an unauthenticated browser.

The browser may contain the Supabase URL and publishable key. Never commit the secret/service-role key, database password, access token, or real employee exports.

Required checks:

- Anonymous requests cannot read any HR table.
- Employees can read only their own profile, assignments, and submissions.
- An employee cannot submit a matching assigned to another employee.
- Closed or future cycles reject submissions.
- Score adjustment tables are readable only by privileged users and writable only through a trusted server operation.

