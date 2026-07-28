import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202607290001_android_push_notifications.sql', import.meta.url), 'utf8');
const manifest = fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const pushApi = fs.readFileSync(new URL('../api/admin-state.js', import.meta.url), 'utf8');
const pushHelper = fs.readFileSync(new URL('../lib/push.js', import.meta.url), 'utf8');

test('Android notification permission is requested and denied users can open settings', () => {
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(html, /requestPermissions\(\)/);
  assert.match(html, /NotificationSettings\?\.open/);
  assert.match(html, /앱 알림이 꺼져 있습니다/);
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

test('native token is registered after login and disabled on logout', () => {
  assert.match(html, /action: 'push_register'/);
  assert.match(html, /action: 'push_unregister'/);
  assert.match(html, /initializeNativePushNotifications\(\)/);
});
