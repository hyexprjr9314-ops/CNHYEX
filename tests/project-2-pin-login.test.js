import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isAllowedPin, normalizeLoginId, pinAuthPassword } from '../api/pin-login.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('employee login ids normalize without accepting ambiguous or oversized input', () => {
  assert.equal(normalizeLoginId('  ｈｙ-1027 '), 'HY-1027');
  assert.equal(normalizeLoginId(null), '');
});

test('the six digit PIN is transformed into a strong Auth password with a server secret', () => {
  const first = pinAuthPassword('481593', 'HY-1027', 'secret-a');
  assert.equal(first, pinAuthPassword('481593', 'hy-1027', 'secret-a'));
  assert.notEqual(first, pinAuthPassword('481593', 'HY-1027', 'secret-b'));
  assert.ok(first.length > 40);
  assert.equal(first.includes('481593'), false);
});

test('six digit PIN policy rejects repeated, sequential, nonnumeric, and employee-id PINs', () => {
  for (const pin of ['000000', '111111', '123456', '654321', '12A456', '12345', '1234567']) {
    assert.equal(isAllowedPin(pin, 'HY-8899'), false, pin);
  }
  assert.equal(isAllowedPin('481593', 'HY-481593'), false);
  assert.equal(isAllowedPin('481593', 'HY-1027'), true);
});

test('PIN login is rate limited, generic on credential failure, and stores only hashed identifiers', async () => {
  const source = await read('api/pin-login.js');
  assert.match(source, /pin_login_attempt_audit/);
  assert.match(source, />= 5/);
  assert.match(source, />= 20/);
  assert.match(source, /사번 또는 PIN을 다시 확인해 주세요/);
  assert.match(source, /createHmac\('sha256'/);
  assert.doesNotMatch(source, /insert\(\{[^}]*loginId/s);
});

test('PIN enrollment uses a one-time hashed token with expiry and invalidates PIN on profile-write failure', async () => {
  const [users, enrollment] = await Promise.all([read('api/users.js'), read('api/pin-enrollment.js')]);
  assert.match(users, /crypto\.randomBytes\(32\)/);
  assert.match(users, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
  assert.match(users, /#enroll=\$\{token\}/);
  assert.match(enrollment, /pin_enrollment_token_hash/);
  assert.match(enrollment, /pin_enrollment_expires_at/);
  assert.match(enrollment, /pin_enrollment_token_hash: null/);
  assert.match(enrollment, /crypto\.randomBytes\(24\)/);
});

test('database contract keeps PIN secrets out of public tables and enforces unique login ids', async () => {
  const migration = await read('supabase/migrations/202608010001_pin_mobile_login.sql');
  assert.match(migration, /users_login_id_unique/);
  assert.match(migration, /revoke all privileges on table public\.pin_login_attempt_audit from anon, authenticated/);
  assert.doesNotMatch(migration, /\bpin\s+text\b/i);
});

test('mobile-friendly UI supports email or employee id and a large one-screen PIN enrollment flow', async () => {
  const index = await read('index.html');
  assert.match(index, /이메일 또는 사번/);
  assert.match(index, /id="view-pin-enrollment"/);
  assert.match(index, /inputmode="numeric" pattern="\[0-9\]\{6\}"/);
  assert.match(index, /min-h-16/);
  assert.match(index, /initializePinEnrollment\(\)/);
  assert.match(index, /callUsersApi\('POST', \{ action: 'generate_pin_enrollment'/);
});
