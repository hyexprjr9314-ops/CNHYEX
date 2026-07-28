import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Android wrapper loads only the HTTPS production app', async () => {
  const config = JSON.parse(await read('../capacitor.config.json'));
  assert.equal(config.appId, 'com.cnhyex.hr');
  assert.equal(config.server.url, 'https://cnhyex.vercel.app');
  assert.equal(config.server.cleartext, false);
});

test('Android release build is signed and disables cleartext and backups', async () => {
  const [gradle, manifest, workflow] = await Promise.all([
    read('../android/app/build.gradle'),
    read('../android/app/src/main/AndroidManifest.xml'),
    read('../.github/workflows/build-android-apk.yml')
  ]);
  assert.match(gradle, /signingConfig signingConfigs\.release/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(workflow, /assembleRelease/);
  assert.match(workflow, /apksigner[\s\S]*verify --verbose --print-certs/);
});

test('Android launcher matches the teal bus used by the web header', async () => {
  const [gradle, background, foreground] = await Promise.all([
    read('../android/app/build.gradle'),
    read('../android/app/src/main/res/values/ic_launcher_background.xml'),
    read('../android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml')
  ]);
  assert.match(gradle, /versionCode 2[\s\S]*versionName "1\.1"/);
  assert.match(background, /#0D9488/);
  assert.match(foreground, /android:fillColor="#FFFFFF"/);
});
