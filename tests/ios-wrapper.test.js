import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8');
const plist = fs.readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/build-ios-ipa.yml', import.meta.url), 'utf8');

test('iOS wrapper uses the production portal with the company bundle identity', () => {
  assert.match(packageJson, /"@capacitor\/ios": "8\.4\.2"/);
  assert.match(packageJson, /"ios:sync": "cap sync ios"/);
  assert.match(config, /"appId": "com\.cnhyex\.hr"/);
  assert.match(config, /"url": "https:\/\/cnhyex\.vercel\.app"/);
  assert.match(plist, /<string>충남한양 인사평가<\/string>/);
});

test('iPhone UI is portrait-only while iPad remains unrestricted', () => {
  const phone = plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] || '';
  const ipad = plist.match(/<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] || '';
  assert.match(phone, /UIInterfaceOrientationPortrait/);
  assert.doesNotMatch(phone, /Landscape/);
  assert.match(ipad, /LandscapeLeft/);
});

test('macOS workflow builds and packages a deterministic IPA artifact', () => {
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow, /CNHYEX-iOS-unsigned\.ipa/);
  assert.match(workflow, /shasum -a 256/);
  assert.match(workflow, /CNHYEX_APPLE_CERTIFICATE_BASE64/);
  assert.match(workflow, /PROVISIONING_PROFILE_SPECIFIER/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /CNHYEX-iOS-signed\.ipa/);
});
