import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fix = await readFile(
  new URL('../supabase/migrations/202607270001_fix_approval_result_reference.sql', import.meta.url),
  'utf8'
);
const resultApi = await readFile(new URL('../api/result-state.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('approval finalizes and validates the real final-results table', () => {
  assert.match(fix, /from public\.evaluation_final_results r/g);
  assert.doesNotMatch(fix, /evaluation_cycle_final_results/);
  assert.match(fix, /where id=p_cycle_id for update/);
  assert.match(fix, /Approval already requested/);
});

test('publication remains scoped to the selected evaluation cycle', () => {
  assert.match(resultApi, /case 'publish': return \{ p_cycle_id: cycleId/);
  assert.match(index, /cycle_id: Number\(currentSelectedSummaryCycleId\)/);
  assert.match(index, /const nextPublished = selectedCycle\.results_published !== true/);
});
