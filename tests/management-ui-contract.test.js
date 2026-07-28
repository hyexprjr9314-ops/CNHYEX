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
  assert.match(index, /evalmanage: roleInfo\.isAdmin/);
  assert.match(index, /closingmanage: roleInfo\.isPrivileged/);
  assert.match(index, /admin: roleInfo\.isAdmin/);
  assert.match(index, /function replaceNavTabClasses\(tab, classes\)/);
  assert.match(index, /replaceNavTabClasses\(btn, "px-4 py-2 rounded-xl transition text-slate-400/);
  assert.match(index, /if \(viewId === 'myresults' && !canCurrentUserViewResults\(\)\)/);
  assert.doesNotMatch(index, /tab\.className = "px-4 py-2 rounded-xl transition text-slate-400/);
});

test('closing management owns progress, summary, and history without duplicating their DOM ids', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const evaluationView = index.slice(index.indexOf('id="view-evalmanage"'), index.indexOf('id="view-closingmanage"'));
  const closingView = index.slice(index.indexOf('id="view-closingmanage"'), index.indexOf('<!-- MODALS -->'));

  assert.match(index, /id="nav-tab-closingmanage"/);
  assert.doesNotMatch(evaluationView, /admin-tab-progress|admin-tab-summary|admin-tab-history/);
  for (const subtab of ['progress', 'summary', 'history']) {
    assert.match(closingView, new RegExp(`id="admin-tab-${subtab}"`));
    assert.match(closingView, new RegExp(`id="admin-subtab-${subtab}"`));
    assert.equal((index.match(new RegExp(`id="admin-subtab-${subtab}"`, 'g')) || []).length, 1);
  }
  assert.match(index, /currentActiveView === 'closingmanage'/);
  assert.match(index, /navigateTo\('closingmanage'\);\s*switchAdminTab\('summary'\)/);
  assert.match(index, /if \(targetView === 'evalmanage' && !roleInfo\.isAdmin\)/);
  assert.match(index, /targetView = roleInfo\.isExecutive \? 'closingmanage' : 'list';/);
  assert.match(index, /viewId === 'evalmanage' && roleInfo\.isExecutive/);
  assert.doesNotMatch(index, /#progress-cycle-select,\s*#summary-cycle-select/);
  assert.match(index, /async function sendBulkGradeNoticeEmails\(\) \{\s*if \(!checkUserRole\(currentLoggedInUser\)\.isAdmin\)/);
  assert.match(index, /id="bulk-grade-mail-btn"[^>]+class="hidden /);
});

test('score summary shows compact cohort percentile reasons and stable mail actions', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const basisBuilder = index.match(/function buildSummaryGradeBasisMap\(cycleScores = \{\}\) \{[\s\S]*?\n      \}/)?.[0] ?? '';

  assert.match(index, />등급책정 사유<\/th>/);
  assert.match(basisBuilder, /본사/);
  assert.match(basisBuilder, /영업소/);
  assert.match(basisBuilder, /정비사/);
  assert.match(basisBuilder, /상위 \$\{percentByTarget\.get\(targetId\) \|\| '-'\}%/);
  assert.match(basisBuilder, /승인 \$\{calculatedGrade\}→\$\{score\.grade_override\}/);
  assert.match(index, /inline-flex h-7 w-7 shrink-0 items-center justify-center/);
  assert.match(index, /<span class="sr-only">발송 완료<\/span>/);
});

test('archived history uses the same immutable final score and approved grade as summary', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const resolver = index.match(/function resolveArchivedHistoryPerson\(cycleId, person = \{\}\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(resolver, /finalResultsByCycle\[Number\(cycleId\)\]\?\.\[Number\(person\.id\)\]/);
  assert.match(resolver, /finalResult\.effective_score \?\? person\.score/);
  assert.match(resolver, /finalResult\.approved_grade \|\| finalResult\.relative_grade \|\| person\.grade/);
  assert.match(index, /resolveArchivedHistoryPerson\(archive\.cycleId, person\)/);
  assert.match(index, /resolveArchivedHistoryPerson\(cycleId, snapshotPerson\)/);
  assert.match(index, /resolveArchivedHistoryPerson\(histArchive\.cycleId, archivedPerson\)/);
});

test('archived history remains visible across publication changes and state reloads', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const historyRenderer = index.match(/function renderHistoryTable\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
  const serverLoader = index.match(/async function loadFromServer\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(historyRenderer, /const archivedHistoryDb = \[\.\.\.evaluationHistoryDb\]/);
  assert.doesNotMatch(historyRenderer, /results_published/);
  assert.doesNotMatch(serverLoader, /evaluationHistoryDb = \[\]/);
  assert.match(serverLoader, /if \(cyclesResult\.error\) throw cyclesResult\.error/);
  assert.match(index, /if \(toolbar\.querySelector\('\[data-directory="company"\]'\)\.value !== state\.company\) state\.company = ''/);
  assert.match(index, /if \(status\.value !== state\.status\) state\.status = ''/);
});

test('expired sessions are handled consistently by closing-management API wrappers', async () => {
  const index = await readFile(indexUrl, 'utf8');
  for (const name of ['callResultStateApi', 'callEvaluationDetailApi', 'callMailApi']) {
    const start = index.indexOf(`async function ${name}`);
    const next = index.indexOf('\n    async function ', start + 1);
    const source = index.slice(start, next > start ? next : start + 3000);
    assert.match(source, /sessionError \|\| !sessionData\.session\) \{\s*await handleLogout\(\)/);
    assert.match(source, /response\.status === 401/);
    assert.match(source, /await handleLogout\(\)/);
  }
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
  assert.match(index, /\.hard-delete-action-white,[\s\S]*?color: #FFFFFF !important;/);
  assert.equal((index.match(/hard-delete-action-white bg-rose-700/g) || []).length, 3);
});

test('cycle lifecycle actions finish evaluation setup before closing management begins', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const nav = index.slice(
    index.indexOf('EVALUATION MANAGEMENT SUB-TABS NAVIGATION'),
    index.indexOf('id="management-cycle-toolbar"')
  );
  const cycleRenderer = index.match(/function renderCyclesList\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.ok(nav.indexOf("switchAdminTab('matching')") < nav.indexOf("switchAdminTab('lifecycle')"));
  assert.doesNotMatch(nav, /switchAdminTab\('progress'\)/);
  assert.match(index, /id="admin-subtab-lifecycle"/);
  assert.match(index, /id="cycle-lifecycle-list-container"/);
  assert.match(cycleRenderer, /mode === 'setup'/);
  assert.match(cycleRenderer, /mode === 'lifecycle'/);
  assert.match(cycleRenderer, /deleteEvaluationCycle\(\$\{c\.id\}\)/);
  assert.match(cycleRenderer, /cycle_force_close/);
  assert.doesNotMatch(cycleRenderer, /cycle_close/);
});

test('evaluation submission defers realtime reloads and prevents duplicate clicks', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const scheduler = index.match(/function scheduleCentralReload\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
  const submitter = index.match(/async function confirmFinalSubmission\(\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(index, /id="evaluation-final-submit-button"/);
  assert.match(scheduler, /isEvaluationInteractionActive\(\) \|\| evaluationSubmissionPending/);
  assert.match(scheduler, /centralReloadDeferred = true/);
  assert.match(submitter, /if \(evaluationSubmissionPending\) return/);
  assert.match(submitter, /submitButton\.disabled = true/);
  assert.match(submitter, /currentTargetEmp\.completed = 1/);
  assert.doesNotMatch(submitter, /await loadFromServer\(\)/);
  assert.match(submitter, /finally \{/);
  assert.match(submitter, /flushDeferredCentralReload\(\)/);
});

test('administrator setup reveals existing evaluation tabs step by step without changing APIs', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const permissions = index.slice(
    index.indexOf('id="admin-subtab-permissions"'),
    index.indexOf('ADMIN SUB-TAB: EVALUATION MATCHING MANAGEMENT')
  );
  const questions = index.slice(
    index.indexOf('id="admin-subtab-questions"'),
    index.indexOf('ADMIN SUB-TAB: PERMISSION MANAGEMENT')
  );
  const matching = index.slice(
    index.indexOf('id="admin-subtab-matching"'),
    index.indexOf('ADMIN SUB-TAB: EVALUATION LIFECYCLE MANAGEMENT')
  );
  const visibility = index.match(/function applyAdminSetupVisibility\(animateStep = null\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
  const advance = index.match(/async function advanceAdminSetupStep\(currentStep\) \{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(index, /const adminSetupStepIndex = Object\.freeze/);
  assert.match(index, /cycles: 0, permissions: 1, questions: 2, matching: 3, lifecycle: 4/);
  assert.match(visibility, /button\.classList\.toggle\('hidden', !visible\)/);
  assert.match(index, /prefers-reduced-motion: reduce/);
  assert.match(index, /data-admin-setup-next/);
  assert.doesNotMatch(permissions, /평가 주기 선택:/);
  assert.match(permissions, /data-admin-setup-next="permissions"/);
  assert.match(permissions, /data-admin-setup-next="permissions"[^>]+class="sm:ml-auto/);
  assert.match(permissions, /id="perm-cycle-select"[^>]+class="hidden"/);
  assert.match(questions, /data-admin-setup-next="questions"/);
  assert.match(questions, /data-admin-setup-next="questions"[^>]+class="sm:ml-auto/);
  assert.match(questions, /CSV Import & Download Action Buttons[\s\S]*data-admin-setup-next="questions"/);
  assert.match(matching, /data-admin-setup-next="matching"/);
  assert.match(matching, /data-admin-setup-next="matching"[^>]+class="sm:ml-auto/);
  assert.match(matching, /toggle-matching-mode-btn[\s\S]*data-admin-setup-next="matching"/);
  assert.match(advance, /usersDb\.some\(user => user\.can_evaluate !== false\)/);
  assert.match(advance, /questionsForCycle\(cycleId\)/);
  assert.match(advance, /customManualMatchingsDb\.filter/);
  assert.match(index, /if \(\['진행중', '일시정지'\]\.includes/);
  assert.match(index, /if \(!cycle \|\| isClosedEvaluationCycle\(cycle\)\) return 0/);
  assert.doesNotMatch(index, /action:\s*'admin_setup_step'/);
});

test('question management loads and renders only cycle-scoped questions', async () => {
  const index = await readFile(indexUrl, 'utf8');

  assert.match(index, /function questionsForCycle\(cycleId\)/);
  assert.match(index, /\.in\('cycle_id', questionCycleIds\)/);
  assert.match(index, /let filteredQuestions = questionsForCycle\(selectedCycleId\)/);
  assert.match(index, /\.eq\('cycle_id', cycleId\)\.order\('id'\)/);
  assert.doesNotMatch(index, /!question\.cycleId \|\| Number\(question\.cycleId\) === cycleId/);
  assert.doesNotMatch(index, /!q\.cycleId \|\| String\(q\.cycleId\) === String\(selectedCycleId\)/);
});

test('company filters use consistent segmented buttons and archived filters stay cycle-scoped', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const historyMarkup = index.slice(
    index.indexOf('id="history-global-toolbar"'),
    index.indexOf('id="archived-history-container"')
  );
  const historyRenderer = index.slice(
    index.indexOf('function renderHistoryTable()'),
    index.indexOf('function renderMyResults()')
  );

  assert.match(index, /id="progress-company-segments"/);
  assert.match(index, /id="summary-company-segments"/);
  assert.doesNotMatch(index, /id="progress-company-filter"/);
  assert.doesNotMatch(index, /id="summary-filter-company"/);
  assert.match(index, /bg-slate-700[\s\S]*?>전체</);
  assert.match(index, /bg-orange-600[\s\S]*?>충남고속</);
  assert.match(index, /bg-\[#0047AB\][\s\S]*?>한양고속</);
  assert.match(index, /button\[data-company-value\]\s*\{\s*color: #FFFFFF !important;/);
  assert.match(index, /button\[data-company-value="\(주\)충남고속"\]\s*\{\s*background: #EA580C !important;/);
  assert.match(index, /button\[data-company-value="\(주\)한양고속"\]\s*\{\s*background: #0047AB !important;/);
  assert.match(historyMarkup, /id="history-global-search"/);
  assert.match(historyMarkup, /id="history-close-sort"/);
  assert.doesNotMatch(historyMarkup, /전체 소속사|전체 부서|전체 등급/);
  assert.match(historyRenderer, /history-company-segments-\$\{Number\(archive\.cycleId\)\}/);
  assert.match(historyRenderer, /전체 부서/);
  assert.match(historyRenderer, /전체 등급/);
  assert.match(historyRenderer, />이름순</);
  assert.match(historyRenderer, />소속·부서순</);
  assert.match(historyRenderer, /cycleState\.sortKey === 'company'/);
  assert.match(historyRenderer, /localeCompare\(String\(rightValue \|\| ''\), 'ko', \{ numeric: true \}\)/);
  assert.match(historyRenderer, /getHistoryCycleViewState\(archive\.cycleId\)/);
  assert.doesNotMatch(historyRenderer, /ensureDirectoryToolbar\('history'/);
});
