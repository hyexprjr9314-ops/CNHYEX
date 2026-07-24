import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240006_governance_state_machine.sql', import.meta.url);

test('governance migration makes finalization, approval, and publication version-aware', async () => {
  const source = await readFile(migrationUrl, 'utf8');
  for (const token of ['result_version integer', 'evaluation_final_results', 'governance_finalize_cycle', 'for update', 'All active adjustments require stage 2 completion', 'result_version=v_cycle.result_version']) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /insert into public\.evaluation_archives/);
  assert.match(source, /insert into public\.evaluation_final_results/);
  assert.match(source, /update public\.evaluation_cycles set status='마감\/보관됨'/);
});
