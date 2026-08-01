import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202607290001_android_push_notifications.sql', import.meta.url), 'utf8');
const manifest = fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const nativePlugin = fs.readFileSync(new URL('../android/app/src/main/java/com/cnhyex/hr/NotificationSettingsPlugin.java', import.meta.url), 'utf8');
const pushApi = fs.readFileSync(new URL('../api/admin-state.js', import.meta.url), 'utf8');
const pushHelper = fs.readFileSync(new URL('../lib/push.js', import.meta.url), 'utf8');

test('Android notification permission is requested and denied users can open settings', () => {
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(html, /requestPermissions\(\)/);
  assert.match(html, /NotificationSettings\?\.open/);
  assert.match(nativePlugin, /pushConfigured/);
  assert.match(html, /if \(!settings\?\.status\) return/);
  assert.match(html, /if \(!nativeStatus\?\.pushConfigured\) return/);
  assert.match(html, /앱 알림이 꺼져 있습니다/);
  assert.match(html, /onclick="snoozePushPermissionNotice\('android'\)">나중에/);
  assert.match(html, /isPushPermissionNoticeSnoozed\('android'\)/);
  assert.match(html, /clearPushPermissionNoticeSnooze\('android'\)/);
});

test('push events are idempotent per recipient and never block business actions', () => {
  assert.match(migration, /unique \(recipient_user_id, event_key\)/i);
  assert.match(pushHelper, /onConflict: 'recipient_user_id,event_key'/);
  assert.match(pushHelper, /Push dispatch failed without blocking the business action/);
});

test('assignment, completion and result notification contracts are present', () => {
  assert.match(pushApi, /collection_complete:/);
  assert.match(pushApi, /평가자들의 평가 결과 취합이 완료되었습니다/);
  assert.match(html, /push_evaluation_submitted/);
});

test('push tokens survive logout and are rebound to the next authenticated account', () => {
  assert.match(html, /action: 'push_register'/);
  assert.match(html, /async function syncPersistedPushTokens\(\)/);
  assert.match(html, /await Promise\.allSettled\(registrations\)/);
  const logout = html.match(/async function handleLogout\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.doesNotMatch(logout, /push_unregister/);
  assert.doesNotMatch(logout, /removeItem\('cnhy_(?:native|web)_push_token'\)/);
  assert.match(html, /initializeNativePushNotifications\(\)/);
});
