import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PIN accounts cannot overwrite their derived authentication password', async () => {
  const html = await read('index.html');
  assert.match(html, /currentLoggedInUser\?\.login_method === 'pin'/);
  assert.match(html, /PIN 계정에서는 일반 비밀번호를 변경할 수 없습니다/);
  assert.match(html, /signInWithPassword\(\{\s*email:[\s\S]*password: currentP/);
});

test('email passwords keep exact whitespace semantics', async () => {
  const html = await read('index.html');
  assert.match(html, /const pass = document\.getElementById\('login-password'\)\.value;/);
  assert.match(html, /const newP = document\.getElementById\('change-new-pass'\)\.value;/);
});

test('permission changes are locked during current evaluation governance', async () => {
  const api = await read('api/admin-state.js');
  assert.match(api, /action === 'permission_update'[\s\S]*?await assertGlobalConfigurationMutable\(service\)/);
  assert.match(api, /action === 'permission_bulk_update'[\s\S]*?await assertGlobalConfigurationMutable\(service\)/);
});

test('PIN identity challenges are returned only after a valid PIN authenticates', async () => {
  const api = await read('api/pin-login.js');
  const authenticateAt = api.indexOf('authenticated.push');
  assert.ok(authenticateAt > 0);
  assert.ok(api.indexOf('requires_company', authenticateAt) > authenticateAt);
  assert.ok(api.indexOf('requires_phone_suffix', authenticateAt) > authenticateAt);
  assert.match(api, /const loginHash = hash\(serviceKey, name\)/);
});

test('users API distinguishes expired authentication from insufficient authorization', async () => {
  const api = await read('api/users.js');
  assert.match(api, /로그인이 필요합니다.'\), \{ status: 401 \}/);
  assert.match(api, /관리자 권한이 필요합니다.'\), \{ status: 403 \}/);
  assert.match(api, /return send\(res, error\.status \|\| 500/);
});

test('browser authentication dependency is pinned and colored action labels stay white', async () => {
  const html = await read('index.html');
  assert.match(html, /@supabase\/supabase-js@2\.57\.4/);
  for (const color of ['teal-700', 'violet-600', 'indigo-600', 'amber-600', 'orange-600']) {
    assert.match(html, new RegExp(`\\[class~="bg-${color}"\\]`));
  }
});

test('retired password and sync-status copy cannot mislead users', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /초기: 휴대폰 번호 뒤 4자리/);
  assert.doesNotMatch(html, /서버 동기화 정상|sync-footer-status|setCentralSyncStatus/);
  assert.match(html, /centralRealtimeChannel\.subscribe\(\)/);
});
