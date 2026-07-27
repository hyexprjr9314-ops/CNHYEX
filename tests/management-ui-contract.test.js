import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexUrl = new URL('../index.html', import.meta.url);

test('management UI gives administrators and executives one final-adjustment control', async () => {
  const index = await readFile(indexUrl, 'utf8');

  assert.equal((index.match(/async function handleLogout\(\)/g) || []).length, 1);
  assert.match(index, /if \(!roleInfo\.isAdmin && !roleInfo\.isExecutive\) return ''/);
  assert.match(index, /action: 'adjust_final'/);
  assert.match(index, /최종 점수 조정/);
  assert.doesNotMatch(index, /2차 조정\/확정|1차 조정 대기/);
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

test('question editor exposes all four employee tracks and removes relationship targeting', async () => {
  const index = await readFile(indexUrl, 'utf8');
  for (const value of ['headquarters_member', 'headquarters_leader', 'branch_employee', 'mechanic']) {
    assert.match(index, new RegExp(`<option value="${value}">`));
  }
  const resolver = index.match(/function questionTrackForTarget\(target = \{\}\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
  assert.match(resolver, /workplace.*dept.*영업소/);
  assert.ok(resolver.indexOf("type === '정비사'") < resolver.indexOf("includes('영업소')"));
  assert.ok(resolver.indexOf('팀장/부서장급') < resolver.indexOf("includes('영업소')"));
  assert.doesNotMatch(index, /id="q-audience-in"|id="q-dept-in"|id="edit-q-audience"|id="edit-q-dept"/);
  assert.match(index, /function normalizeQuestionTrack\(track\)/);
  for (const label of ['내부 평가', '내부 교류평가', '외부 평가', '부서장 평가', '부서장 교류평가']) {
    assert.match(index, new RegExp(label));
  }
});

test('progress and summary use the same server-backed evaluation detail modal', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const detail = index.match(/async function openDetailEvalModal\(empId, requestedCycleId = null\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(index, /openDetailEvalModal\(\$\{row\.person\.id\}, \$\{cycleId\}\)/);
  assert.match(index, /openDetailEvalModal\(\$\{emp\.id\}\)/);
  assert.match(detail, /callEvaluationDetailApi\(cycleId, empId\)/);
  assert.doesNotMatch(detail, /supabaseClient\.from\('evaluations'\)/);
  assert.match(detail, /detail\.submitted_count/);
  assert.match(detail, /if \(!item\.submitted\)/);
});

test('central state applies score aggregates before optional settings UI work', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const applyState = index.slice(
    index.indexOf('function applyCentralState(payload)'),
    index.indexOf('async function loadCentralState()')
  );

  assert.ok(applyState.indexOf('cycleScoresDb = payload.cycle_scores') >= 0);
  assert.ok(applyState.indexOf('cycleScoresDb = payload.cycle_scores') < applyState.indexOf('selectWeightTrack(selectedWeightTrack)'));
});

test('evaluation form selects questions only from the evaluatee employee type', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const renderer = index.match(/function renderPeerQuestions\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(renderer, /questionTrackForTarget\(emp\)/);
  assert.match(renderer, /questionTrack === 'all' \|\| questionTrack === targetTrack\.key/);
  assert.doesNotMatch(renderer, /targetDept|target_dept|workplace|relationshipType|audience/);
});

test('evaluation form clears the previous target comment before loading another target', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const opener = index.match(/async function openEvaluationForm\(emp, isEdit = false\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(opener, /document\.getElementById\('eval-comment-input'\)\.value = ''/);
  assert.match(opener, /updateCommentCounter\(\)/);
  assert.ok(opener.indexOf("document.getElementById('eval-comment-input').value = ''") < opener.indexOf('if (isEdit)'));
  assert.ok(opener.indexOf("document.getElementById('eval-comment-input').value = ''") < opener.indexOf('prevData.comment'));
});

test('target list renders all five display-only relationship groups', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const renderer = index.match(/function renderEmployeeGrid\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  for (const key of ['internal', 'internal_exchange', 'external', 'leadership', 'leadership_exchange']) {
    assert.match(renderer, new RegExp(`key: '${key}'`));
  }
  assert.doesNotMatch(index, /fa-user-check mr-1"><\/i> \$\{myCurrentStageText\}/);
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

  assert.doesNotMatch(index, /MULTI-STAGE PIPELINE ENGINE|직군별 3~5단계 다단계/);
  assert.match(index, /id="matching-cycle-select"/);
  assert.match(index, /\['perm-cycle-select', 'matching-cycle-select'\]\.forEach/);
  assert.match(index, /getElementById\('matching-cycle-select'\)\?\.value \|\| document\.getElementById\('perm-cycle-select'\)\?\.value/);
  assert.match(index, /let selectedEvaluationCycleId = null/);
  assert.match(index, /function handleCycleSelectChange\(selectEl\)/);
  assert.match(index, /currentSelectedSummaryCycleId = cycleId/);
  assert.doesNotMatch(index, /id="history-close-cycle-select"/);
  assert.doesNotMatch(index, /handleCloseCycleSubmit\(\)/);
  assert.match(index, /function isClosedEvaluationCycle\(cycle\)/);
  assert.match(index, /const publishedCycles = sortedCycles\.filter\(isVisiblePublishedResultCycle\);/);
  assert.match(index, /function isVisiblePublishedResultCycle\(cycle\)/);
  assert.match(index, /const setupCycles = sortedCycles\.filter/);
  assert.match(index, /const progressCycles = sortedCycles\.filter/);
  assert.match(index, /const finalizedApprovalCycles = sortedCycles\.filter/);
  assert.match(index, /const summaryCycles = \[/);
  assert.match(index, /cycles: cyclesDb\.filter\(cycle => !isClosedEvaluationCycle\(cycle\)\)/);
  assert.match(index, /\[\.\.\.select\.options\]\.some\(option => option\.value === String\(cycleId\)\)/);
  assert.match(index, /const closedWithoutArchive = cyclesDb\.filter/);
  assert.match(index, /확정 결과 없이 종료된 평가주기입니다/);
  assert.doesNotMatch(index, /onclick="deleteArchivedHistory\(\$\{archive\.cycleId\}\)"/);
});

test('cycle lifecycle actions live in a dedicated tab between matching and progress', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const nav = index.slice(
    index.indexOf('EVALUATION MANAGEMENT SUB-TABS NAVIGATION'),
    index.indexOf('id="management-cycle-toolbar"')
  );
  const cycleRenderer = index.match(/function renderCyclesList\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.ok(nav.indexOf("switchAdminTab('matching')") < nav.indexOf("switchAdminTab('lifecycle')"));
  assert.ok(nav.indexOf("switchAdminTab('lifecycle')") < nav.indexOf("switchAdminTab('progress')"));
  assert.match(index, /id="admin-subtab-lifecycle"/);
  assert.match(index, /id="cycle-lifecycle-list-container"/);
  assert.match(cycleRenderer, /mode === 'setup'/);
  assert.match(cycleRenderer, /mode === 'lifecycle'/);
  assert.match(cycleRenderer, /deleteEvaluationCycle\(\$\{c\.id\}\)/);
  assert.match(cycleRenderer, /cycle_force_close/);
  assert.doesNotMatch(cycleRenderer, /cycle_close/);
});
