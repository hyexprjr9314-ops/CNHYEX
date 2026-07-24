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

test('manual matching commits the authoritative server response without a second read', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const saveFlow = index.match(/async function saveStagedMatchingChanges\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(index, /\.filter\(m => Number\(m\.evaluatorId\) === Number\(evaluatorId\)/);
  assert.match(index, /evaluatorId: Number\(row\.evaluator_id\)/);
  assert.equal(saveFlow.includes('await loadCentralState()'), false);
  assert.match(saveFlow, /Array\.isArray\(payload\.data\?\.matchings\)/);
  assert.match(saveFlow, /customManualMatchingsDb = customManualMatchingsDb/);
  assert.match(saveFlow, /savedMatchings\.map\(row => \(\{/);
  assert.equal(saveFlow.includes('서버 저장 결과를 확인하지 못했습니다'), false);
});

test('matching studio exposes and synchronizes its own cycle selector', async () => {
  const index = await readFile(indexUrl, 'utf8');

  assert.match(index, /id="matching-cycle-select"/);
  assert.match(index, /\['perm-cycle-select', 'matching-cycle-select'\]\.forEach/);
  assert.match(index, /getElementById\('matching-cycle-select'\)\?\.value \|\| document\.getElementById\('perm-cycle-select'\)\?\.value/);
  assert.match(index, /let selectedEvaluationCycleId = null/);
  assert.match(index, /function handleCycleSelectChange\(selectEl\)/);
  assert.match(index, /currentSelectedSummaryCycleId = cycleId/);
  assert.match(index, /id="history-close-cycle-select" onchange="handleCycleSelectChange\(this\)"/);
  assert.match(index, /setSelectedEvaluationCycleId\(selectedEvaluationCycleId \|\| currentSelectValues \|\| sortedCycles\[0\]\.id\)/);
  assert.match(index, /select\.value = String\(selectedCycleId\)/);
});
