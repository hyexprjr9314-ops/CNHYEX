import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const manifest = fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/admin-state.js', import.meta.url), 'utf8');
const push = fs.readFileSync(new URL('../lib/push.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202607290002_web_push_subscriptions.sql', import.meta.url), 'utf8');

test('home screen web app metadata and service worker are present', () => {
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /notificationclick/);
});

test('web push permission is user initiated and subscription is registered', () => {
  assert.match(html, /enableWebPushNotifications/);
  assert.match(html, /pushManager\.subscribe/);
  assert.match(html, /platform: 'web'/);
  assert.match(api, /push_web_config/);
  assert.match(html, /\.push-action-white,[\s\S]*color: #FFFFFF !important/);
  assert.match(html, /class="push-action-white[^"]*" onclick="enableWebPushNotifications\(\)">알림 켜기/);
  assert.match(html, /class="push-action-white[^"]*" onclick="openNativeNotificationSettings\(\)">알림 켜기/);
});

test('web push permission notice closes after every enable attempt', () => {
  const enable = html.match(/async function enableWebPushNotifications\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(enable, /finally \{[\s\S]*removeWebPushPermissionNotice\(\)/);
  assert.doesNotMatch(enable, /showWebPushPermissionNotice\(\)/);
});

test('server dispatch keeps Android FCM and adds standards web push', () => {
  assert.match(push, /sendFirebaseMessage/);
  assert.match(push, /sendWebPush/);
  assert.match(push, /webpush\.sendNotification/);
  assert.match(migration, /'android', 'web'/);
});
