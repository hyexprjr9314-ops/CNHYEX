import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertGlobalConfigurationMutable, isCurrentGovernanceCycle } from './admin-state.js';
import { assertPersonnelClassificationMutable, hasClassificationChange } from './users.js';

function cycleService(cycles) {
  return {
    from(table) {
      assert.equal(table, 'evaluation_cycles');
      return { select: async () => ({ data: cycles, error: null }) };
    }
  };
}

test('generic cycle editing is data-only and lifecycle transitions stay dedicated', async () => {
  const [api, index] = await Promise.all([
    readFile(new URL('./admin-state.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);
  const updateBranch = api.match(/action === 'cycle_update'[\s\S]*?action === 'cycle_validate'/)?.[0] ?? '';

  assert.doesNotMatch(updateBranch, /activate_evaluation_cycle/);
  assert.doesNotMatch(updateBranch, /payload\.status/);
  assert.match(api, /action === 'cycle_activate'/);
  assert.match(api, /action === 'cycle_close'/);
  assert.doesNotMatch(index, /id="edit-cycle-status"/);
  assert.doesNotMatch(index, /status:\s*document\.getElementById\('edit-cycle-status'\)/);
});

test('only current governance cycles lock weights; closed history stays allowed', async () => {
  assert.equal(isCurrentGovernanceCycle({ status: 'closed', internal_approval_status: 'approved' }), false);
  assert.equal(isCurrentGovernanceCycle({ status: 'archived', internal_approval_status: 'approved' }), false);
  assert.equal(isCurrentGovernanceCycle({ status: '\uCD08\uC548', internal_approval_status: 'not_requested' }), false);
  assert.equal(isCurrentGovernanceCycle({ status: '\uC9C4\uD589\uC911', internal_approval_status: 'not_requested' }), true);
  await assert.doesNotReject(() => assertGlobalConfigurationMutable(cycleService([{ status: 'archived', internal_approval_status: 'approved' }])));
});

test('classification changes are denied while a current cycle exists but harmless edits remain safe', async () => {
  const oldProfile = { company: 'A', dept: 'D', workplace: 'W', role: 'R', type: 'T', name: 'Kim' };
  assert.equal(hasClassificationChange(oldProfile, { ...oldProfile, name: 'Lee' }), false);
  assert.equal(hasClassificationChange(oldProfile, { ...oldProfile, dept: 'Different' }), true);
  await assert.doesNotReject(() => assertPersonnelClassificationMutable(cycleService([
    { status: 'closed', internal_approval_status: 'approved' }
  ]), oldProfile, { ...oldProfile, dept: 'Different' }));
  await assert.rejects(
    () => assertPersonnelClassificationMutable(cycleService([
      { status: '\uC9C4\uD589\uC911', internal_approval_status: 'not_requested' }
    ]), oldProfile, { ...oldProfile, dept: 'Different' }),
    error => error.status === 409
  );
  await assert.doesNotReject(() => assertPersonnelClassificationMutable(cycleService([
    { status: '\uC9C4\uD589\uC911', internal_approval_status: 'not_requested' }
  ]), oldProfile, { ...oldProfile, name: 'Lee' }));
});
