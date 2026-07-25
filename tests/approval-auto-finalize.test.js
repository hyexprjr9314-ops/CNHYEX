import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/202607250010_finalize_on_approval_request.sql', import.meta.url);

test('approval request finalizes the result atomically when no archive exists', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /if not exists \(select 1 from public\.evaluation_archives where cycle_id=p_cycle_id\) then\s+perform public\.governance_finalize_cycle\(p_cycle_id, p_actor_id\);/i);
  assert.doesNotMatch(sql, /raise exception 'Closed archive required'/i);
  assert.match(sql, /insert into public\.evaluation_cycle_approval_requests/);
  assert.match(sql, /commit;/i);
});
