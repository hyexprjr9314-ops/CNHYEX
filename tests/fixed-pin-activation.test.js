import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('shared first-time PIN code remains expiring, one-time, and non-unique by token', async () => {
  const [users, enrollment, migration, index] = await Promise.all([
    read('../api/users.js'),
    read('../api/pin-enrollment.js'),
    read('../supabase/migrations/202608120001_allow_shared_pin_activation_code.sql'),
    read('../index.html')
  ]);
  assert.match(users, /PIN_INITIAL_ACTIVATION_CODE = '12345678'/);
  assert.match(users, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
  assert.match(users, /activationCodeHash\(temporaryCode, serviceKey\)/);
  assert.match(enrollment, /pin_enrollment_token_hash: null/);
  assert.match(migration, /drop index if exists public\.users_pin_enrollment_token_unique/);
  assert.match(migration, /create index if not exists users_pin_enrollment_token_idx/);
  assert.match(index, /임시번호 12345678/);
});
