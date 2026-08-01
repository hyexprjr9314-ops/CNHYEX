import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('QR, camera permission, scanner dependency, and employee-number UI are completely removed', async () => {
  const [index, manifest, plist, vercel, pkg, users] = await Promise.all([
    read('index.html'),
    read('android/app/src/main/AndroidManifest.xml'),
    read('ios/App/App/Info.plist'),
    read('vercel.json'),
    read('package.json'),
    read('api/users.js')
  ]);
  for (const source of [index, users]) {
    assert.doesNotMatch(source, /Html5Qrcode|qr_data_url|generate_pin_enrollment|#enroll=/);
  }
  assert.doesNotMatch(index, /QR코드|user-login-id-in|사번 \+ PIN/);
  assert.doesNotMatch(manifest, /android\.permission\.CAMERA|android\.hardware\.camera/);
  assert.doesNotMatch(plist, /NSCameraUsageDescription/);
  assert.match(vercel, /camera=\(\)/);
  assert.doesNotMatch(pkg, /"qrcode"/);
});

test('user registration hides internal login ids and immediately issues a temporary number', async () => {
  const [index, users] = await Promise.all([read('index.html'), read('api/users.js')]);
  assert.match(index, /이름 \+ PIN 간편 로그인/);
  assert.match(index, /openPinActivation\(created\.id\)/);
  assert.match(index, /전화로 읽어 주세요/);
  assert.match(users, /PIN-\$\{crypto\.randomBytes\(8\)/);
  assert.match(users, /temporary_code: temporaryCode/);
});

test('misplaced login-method DOM ids no longer affect question or weight controls', async () => {
  const index = await read('index.html');
  assert.equal((index.match(/id="user-email-field"/g) || []).length, 1);
  assert.equal((index.match(/id="user-login-id-field"/g) || []).length, 0);
  assert.match(index, /id="user-email-field"[\s\S]{0,300}id="user-email-in"/);
  assert.doesNotMatch(index, /id="user-email-field"[\s\S]{0,300}weight-perf-in/);
});
