import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.html', import.meta.url);

test('contextual mascot guide remains optional, accessible, and isolated from evaluation submission', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /id="mascot-guide"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(html, /assets\/mascot-hanyang\.jpg/);
  assert.match(html, /assets\/mascot-chungnam\.jpg/);
  assert.match(html, /id="mascot-guide-action"[\s\S]*runMascotGuideAction/);
  assert.match(html, /mascot-guide-bubble[\s\S]*mix-blend-mode:\s*multiply/);
  assert.match(html, /prefers-reduced-motion[\s\S]*#mascot-guide\.is-visible/);
  assert.match(html, /submit_evaluation_central[\s\S]*if \(submitError\)[\s\S]*showMascotGuide\(/);
  assert.doesNotMatch(html, /mascot-guide[\s\S]{0,500}z-index:\s*9999/);
});

test('administrator mascot guide is read-only, state-aware, and isolated from management actions', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const adminGuide = html.slice(
    html.indexOf('function showAdminMascotGuide'),
    html.indexOf('function filterEmployeeListTrack')
  );
  assert.match(html, /function showAdminMascotGuide\(subtab\)[\s\S]*\['evalmanage', 'admin'\]\.includes\(currentActiveView\)[\s\S]*!roleInfo\.isAdmin/);
  assert.match(html, /internal_approval_status[\s\S]*results_published[\s\S]*cnhy_mascot_admin_v2_/);
  assert.match(html, /requestAnimationFrame\(\(\) => \{[\s\S]*showAdminMascotGuide\(subtab\)[\s\S]*showExecutiveMascotGuide\(subtab\)/);
  ['1단계 · 질문 구성', '2단계 · 권한 확인', '3단계 · 평가자 배정', '4단계 · 사전점검']
    .forEach(label => assert.match(adminGuide, new RegExp(label)));
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
