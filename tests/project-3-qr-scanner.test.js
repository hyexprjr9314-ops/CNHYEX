import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('first login offers a large QR PIN enrollment scanner with a camera-image fallback', async () => {
  const index = await read('index.html');
  assert.match(index, /QR코드로 처음 PIN 설정/);
  assert.match(index, /id="pin-qr-reader"/);
  assert.match(index, /capture="environment"/);
  assert.match(index, /new Html5Qrcode\('pin-qr-reader'\)/);
  assert.match(index, /scanFile\(file, true\)/);
});

test('scanner accepts only production one-time enrollment URLs', async () => {
  const index = await read('index.html');
  assert.match(index, /url\.origin === 'https:\/\/cnhyex\.vercel\.app'/);
  assert.match(index, /url\.pathname === '\/'/);
  assert.match(index, /!url\.search/);
  assert.match(index, /\^#enroll=\[A-Za-z0-9_-\]\{40,100\}\$/);
});

test('Android, iOS, and Vercel explicitly allow camera use without requiring camera hardware', async () => {
  const [manifest, plist, vercel] = await Promise.all([
    read('android/app/src/main/AndroidManifest.xml'),
    read('ios/App/App/Info.plist'),
    read('vercel.json')
  ]);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.hardware\.camera\.any" android:required="false"/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(vercel, /camera=\(self\)/);
});
