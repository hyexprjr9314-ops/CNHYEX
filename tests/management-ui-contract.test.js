import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexUrl = new URL('../index.html', import.meta.url);

test('management UI keeps executive and administrator controls separated', async () => {
  const index = await readFile(indexUrl, 'utf8');

  assert.equal((index.match(/async function handleLogout\(\)/g) || []).length, 1);
  assert.match(index, /if \(roleInfo\.isExecutive\) \{\s*if \(scoreData\.workflow_status === 'first_stage_adjusted'\)/);
  assert.match(index, /if \(!roleInfo\.isAdmin\) return ''/);
  assert.match(index, /action: selectedAdjustmentMode === 'executive' \? 'approve_adjustment' : 'adjust'/);
  assert.match(index, /updatePublishControlVisibility/);
  assert.match(index, /gradeStatusHeader/);
  assert.match(index, /function applyRoleBasedNavigationVisibility\(\)/);
  assert.match(index, /const systemRole = user\.sysRole \?\? user\.sys_role \?\? ''/);
  assert.match(index, /const isExecutive = systemRole === '임원'/);
  assert.match(index, /myresults: canCurrentUserViewResults\(\)/);
  assert.match(index, /return cyclesDb\.some\(cycle => cycle\.results_published === true\)/);
  assert.match(index, /admin: roleInfo\.isAdmin/);
  assert.match(index, /function replaceNavTabClasses\(tab, classes\)/);
  assert.match(index, /replaceNavTabClasses\(btn, "px-4 py-2 rounded-xl transition text-slate-400/);
  assert.match(index, /if \(viewId === 'myresults' && !canCurrentUserViewResults\(\)\)/);
  assert.doesNotMatch(index, /tab\.className = "px-4 py-2 rounded-xl transition text-slate-400/);
});

test('question editor emits canonical tracks and resolves leaders before job-area tracks', async () => {
  const index = await readFile(indexUrl, 'utf8');
  for (const value of ['all', 'headquarters_member', 'headquarters_leader', 'branch_employee', 'mechanic']) {
    assert.match(index, new RegExp(`<option value="${value}">`));
  }
  const resolver = index.match(/function questionTrackForTarget\(target = \{\}\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
  assert.ok(resolver.indexOf('QUESTION_TRACKS.headquarters_leader') < resolver.indexOf('QUESTION_TRACKS.mechanic'));
  assert.match(index, /function normalizeQuestionTrack\(track\)/);
});
