import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  activationCodeHash,
  isAllowedPin,
  isValidLoginName,
  normalizeLoginName,
  pinAuthPassword
} from '../lib/pin-auth.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('employee names normalize Unicode and whitespace without accepting hostile or oversized input', () => {
  assert.equal(normalizeLoginName('  홍  길동\u200B '), '홍 길동');
  assert.equal(isValidLoginName('홍길동'), true);
  assert.equal(isValidLoginName('<script>alert(1)</script>'), false);
  assert.equal(isValidLoginName('가'.repeat(41)), false);
});

test('PIN and temporary numbers are transformed with the service secret and never embedded in Auth passwords', () => {
  const password = pinAuthPassword('481593', 'PIN-A1B2', 'secret-a');
  assert.equal(password, pinAuthPassword('481593', 'pin-a1b2', 'secret-a'));
  assert.notEqual(password, pinAuthPassword('481593', 'PIN-A1B2', 'secret-b'));
  assert.equal(password.includes('481593'), false);
  assert.equal(activationCodeHash('48317259', 'secret-a').includes('48317259'), false);
});

test('six digit PIN policy rejects repeated, sequential, nonnumeric, and name-related numeric values', () => {
  for (const pin of ['000000', '111111', '123456', '654321', '12A456', '12345', '1234567']) {
    assert.equal(isAllowedPin(pin, '홍길동'), false, pin);
  }
  assert.equal(isAllowedPin('481593', '홍길동'), true);
});

test('name PIN login handles duplicate companies and rate limits generic credential failures', async () => {
  const source = await read('api/pin-login.js');
  assert.match(source, /pin_login_name/);
  assert.match(source, /requires_company: true/);
  assert.match(source, /requires_phone_suffix: true/);
  assert.match(source, /endsWith\(phoneSuffix\)/);
  assert.match(source, /companies/);
  assert.match(source, />= 5/);
  assert.match(source, />= 20/);
  assert.match(source, /이름 또는 PIN을 다시 확인해 주세요/);
  assert.doesNotMatch(source, /login_id:\s*name/);
});

test('temporary activation uses the shared initial code for ten minutes, one time, hashed, and compensated on failure', async () => {
  const [users, enrollment] = await Promise.all([read('api/users.js'), read('api/pin-enrollment.js')]);
  assert.match(users, /PIN_INITIAL_ACTIVATION_CODE = '12345678'/);
  assert.match(users, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
  assert.match(users, /activationCodeHash\(temporaryCode, serviceKey\)/);
  assert.match(enrollment, /\^\\d\{8\}\$/);
  assert.match(enrollment, /pin_enrollment_token_hash: null/);
  assert.match(enrollment, /activation_failed/);
  assert.match(enrollment, /crypto\.randomBytes\(24\)/);
});

test('database migration adds normalized name lookup and invalidates old QR enrollment tokens', async () => {
  const migration = await read('supabase/migrations/202608010002_name_temporary_pin_login.sql');
  assert.match(migration, /add column if not exists pin_login_name text/);
  assert.match(migration, /users_pin_login_name_idx/);
  assert.match(migration, /set pin_enrollment_token_hash = null/);
  assert.doesNotMatch(migration, /\bpin\s+text\b/i);
});

test('mobile UI supports email or name and an accessible one-screen temporary-number PIN flow', async () => {
  const index = await read('index.html');
  assert.match(index, /이메일 또는 등록된 이름/);
  assert.match(index, /id="view-pin-enrollment"/);
  assert.match(index, /id="pin-enrollment-code"[^>]+pattern="\[0-9\]\{8\}"/);
  assert.match(index, /id="pin-enrollment-value"[^>]+pattern="\[0-9\]\{6\}"/);
  assert.match(index, /처음 PIN 설정하기/);
  assert.match(index, /관리자에게 최초 설정을 요청한 뒤 임시번호 12345678을 입력해 주세요/);
  assert.ok(index.indexOf('비밀번호 설정 메일 받기') < index.indexOf('id="pin-enrollment-guide"'));
  assert.match(index, /PIN 설정 계속하기/);
  assert.match(index, /id="login-password"[^>]+inputmode="text"/);
  assert.doesNotMatch(index, /id="login-password"[^>]+inputmode="numeric"/);
  assert.match(index, /\.pin-action-white\s*\{\s*color:\s*#FFFFFF\s*!important;/);
  assert.match(index, /class="pin-action-white[^"]*"[^>]*>PIN 설정 계속하기/);
  assert.match(index, /class="pin-action-white[^"]*"[^>]*>PIN 저장하기/);
  assert.match(index, /action: 'generate_pin_activation'/);
});
