import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const policyUrl = new URL('../api/role-policy.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/202607250011_allow_admin_result_publication.sql', import.meta.url);

test('administrators and executives may publish an approved final result', async () => {
  const [policy, index, migration] = await Promise.all([
    readFile(policyUrl, 'utf8'),
    readFile(indexUrl, 'utf8'),
    readFile(migrationUrl, 'utf8')
  ]);
  assert.match(policy, /SHARED_PRIVILEGED_ACTIONS = new Set\(\['adjust_final', 'cancel_adjustment', 'publish'\]\)/);
  assert.match(index, /const canManagePublication = roleInfo\.isAdmin \|\| roleInfo\.isExecutive/);
  assert.match(migration, /v_role not in \('관리자', '임원'\)/);
  assert.match(migration, /internal_approval_status <> 'approved'/);
});
