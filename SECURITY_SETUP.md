# Security setup

Current code changes are local-only. Do not apply migrations or change Vercel/Supabase production settings until the staged verification checklist below passes.

1. Back up the Supabase database.
2. Create one bootstrap administrator in Supabase Auth and link its UID to the matching `public.users.auth_user_id`.
3. Apply every file under `supabase/migrations` in filename order in a staging project first.
   The governance sequence continues through `202607240007_governance_integrity_hardening.sql`; it adds relative grading, staged adjustment/approval workflow, relationship-scoped questions, database-owned finalization, immutable final-result versions, and relationship backfill for existing assignments.
4. Configure the Vercel server environment variables below.
5. Use the administrator CSV screen to create/link the remaining Auth accounts.
6. Test with an employee account, an HR administrator account, and an unauthenticated browser.

Required Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefix with `NEXT_PUBLIC_` or expose it in HTML)
- `PASSWORD_RESET_REDIRECT_URL` (optional)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (required for final-grade notices; never expose these values in the browser)

Before applying migrations to an existing project, inspect evaluation and matching counts and take a verified backup. Never assume that production tables are empty.

The browser may contain the Supabase URL and publishable key. Never commit the secret/service-role key, database password, access token, or real employee exports.

Required checks:

- Anonymous requests cannot read any HR table.
- Employees can read only their own profile, assignments, and submissions.
- An employee cannot submit a matching assigned to another employee.
- Closed or future cycles reject submissions.
- Score adjustment tables are readable only by privileged users and writable only through a trusted server operation.
- `/api/users` and `/api/questions` reject callers who are not linked, active administrators.
- Result publication and score adjustment operations reject callers without privileged roles.
- Password reset mail requests are audited without storing plaintext passwords.
- Grade notices are sent only after the current immutable final-result version has approved internal approval, an open result gate, and published results. The server derives both the recipient and grade; it never accepts either from the browser.
- A finalized result is read from `evaluation_final_results` at the cycle's current `result_version`; later changes to users, questions, weights, or raw submissions must not alter historic reports or notices.
- Password reset mail uses Supabase's reset link flow. The CSV user-creation response and download must not return, store, export, or email a plaintext temporary password.
- Existing `matchings` must be classified/backfilled before relationship-scoped questions are used, and every active target track needs all required weighted multiple-choice categories before submission is enabled.
- The retired AI coaching tables, jobs, endpoints, and UI are not active.
