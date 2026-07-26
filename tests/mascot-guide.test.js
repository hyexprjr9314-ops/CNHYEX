import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.html', import.meta.url);
const hanyangMascotUrl = new URL('../assets/mascot-hanyang-transparent.png', import.meta.url);
const chungnamMascotUrl = new URL('../assets/mascot-chungnam-transparent.png', import.meta.url);

test('contextual mascot guide remains optional, accessible, and isolated from evaluation submission', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /id="mascot-guide"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(html, /assets\/mascot-hanyang-transparent\.png/);
  assert.match(html, /assets\/mascot-chungnam-transparent\.png/);
  assert.match(html, /id="mascot-guide-action"[\s\S]*runMascotGuideAction/);
  assert.doesNotMatch(html, /mascot-guide-bubble[\s\S]*mix-blend-mode:\s*multiply/);
  assert.match(html, /mascot-guide-image[\s\S]*position:\s*absolute[\s\S]*object-fit:\s*contain/);
  assert.match(html, /mascot-guide-talk 2\.4s[\s\S]*infinite/);
  assert.match(html, /prefers-reduced-motion[\s\S]*#mascot-guide\.is-visible/);
  assert.match(html, /submit_evaluation_central[\s\S]*if \(submitError\)[\s\S]*showMascotGuide\(/);
  assert.doesNotMatch(html, /mascot-guide[\s\S]{0,500}z-index:\s*9999/);
});

test('mascot assets use real alpha transparency', async () => {
  for (const assetUrl of [hanyangMascotUrl, chungnamMascotUrl]) {
    const png = await readFile(assetUrl);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, `${assetUrl.pathname} must be an RGBA PNG`);
  }
});

test('administrator mascot guide is read-only, state-aware, and isolated from management actions', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const adminGuide = html.slice(
    html.indexOf('function showAdminMascotGuide'),
    html.indexOf('function filterEmployeeListTrack')
  );
  assert.match(html, /function showAdminMascotGuide\(subtab\)[\s\S]*\['evalmanage', 'admin'\]\.includes\(currentActiveView\)[\s\S]*!roleInfo\.isAdmin/);
  assert.match(html, /internal_approval_status[\s\S]*results_published[\s\S]*cnhy_mascot_admin_v3_/);
  assert.match(html, /requestAnimationFrame\(\(\) => \{[\s\S]*showAdminMascotGuide\(subtab\)[\s\S]*showExecutiveMascotGuide\(subtab\)/);
  [
    '평가주기 등록 위치 보기',
    '평가 권한 설정하기',
    '가중치 설정 위치 보기',
    '질문 등록 위치 보기',
    '평가 매칭관리로 이동',
    '사전점검 버튼 보기',
    '검증 후 시작 버튼 보기',
    '평가 진행 현황 보기',
    '점수 집계·최종 조정 보기',
    '과거 평가 이력 조회'
  ]
    .forEach(label => assert.match(adminGuide, new RegExp(label)));
  assert.match(html, /function adminMascotFlowKey\(cycleId\)[\s\S]*function setAdminMascotFlowStep\(cycleId, step\)/);
  assert.match(html, /id="cycle-validate-\$\{c\.id\}"[\s\S]*id="cycle-activate-\$\{c\.id\}"/);
  assert.match(html, /saveCategoryWeights\(\)[\s\S]*setAdminMascotFlowStep\(cycleId, 4\)[\s\S]*showAdminMascotGuide\('questions'\)/);
  assert.match(html, /validateEvaluationCycle\(cycleId, activate = false\)[\s\S]*setAdminMascotFlowStep\(cycleId, 7\)[\s\S]*showAdminMascotGuide\('cycles'\)/);
  assert.match(html, /Optional mascot admin guide skipped/);
  assert.doesNotMatch(adminGuide, /callAdminStateApi/);
});

test('executive and inactive-cycle mascot guides remain role-scoped and read-only', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const executiveGuide = html.slice(
    html.indexOf('function showExecutiveMascotGuide'),
    html.indexOf('function filterEmployeeListTrack')
  );
  assert.match(html, /function showNoActiveEvaluationGuide\(\)[\s\S]*roleInfo\.isPrivileged[\s\S]*현재 시작된 평가가 없습니다/);
  assert.match(executiveGuide, /roleInfo\.isExecutive \|\| roleInfo\.isAdmin/);
  assert.match(executiveGuide, /current_approver_user_id[\s\S]*승인·반려 위치 보기/);
  assert.match(executiveGuide, /cnhy_mascot_executive_/);
  assert.doesNotMatch(executiveGuide, /callAdminStateApi|callResultStateApi/);
});

test('privileged users are guided from the first list view into evaluation management', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /function showPrivilegedHomeGuide\(\)[\s\S]*currentActiveView !== 'list'[\s\S]*roleInfo\.isPrivileged/);
  assert.match(html, /관리자님, 평가주기 등록부터 권한·가중치·질문·매칭·사전점검·결과 공개까지/);
  assert.match(html, /평가관리 시작하기[\s\S]*view: 'evalmanage'[\s\S]*subtab: roleInfo\.isAdmin \? 'cycles' : 'summary'[\s\S]*target: '#nav-tab-evalmanage'/);
  assert.match(html, /renderLoggedInWelcome\(totalAssignmentCount\);[\s\S]*showNoActiveEvaluationGuide\(\);[\s\S]*showPrivilegedHomeGuide\(\);/);
  assert.match(html, /function showPendingEvaluationGuide\(assignments\)[\s\S]*checkUserRole\(currentLoggedInUser\)\.isPrivileged/);
});
