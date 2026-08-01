import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('logout releases realtime, broadcast, timer, and deferred state before signing out', async () => {
  const index = await read('index.html');
  assert.match(index, /clearTimeout\(centralReloadTimer\)/);
  assert.match(index, /removeChannel\(centralRealtimeChannel\)/);
  assert.match(index, /centralBroadcastChannel\.close\(\)/);
  assert.match(index, /centralReloadDeferred = false/);
});

test('a finalized cycle without a target row is a normal unavailable result, not a 409', async () => {
  const source = await read('api/result-state.js');
  assert.doesNotMatch(source, /Current final result is missing/);
  assert.match(source, /unavailable_reason: 'not_in_final_results'/);
});

test('public password reset fails closed when audit persistence fails', async () => {
  const source = await read('api/mail.js');
  assert.match(source, /if \(audit\.error\) throw audit\.error/);
});

test('baseline response hardening headers are configured without blocking current inline UI', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const headerRoute = config.routes.find(route => route.continue === true && route.headers);
  const headers = new Map(Object.entries(headerRoute.headers));
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.ok(headers.has('Permissions-Policy'));
});
