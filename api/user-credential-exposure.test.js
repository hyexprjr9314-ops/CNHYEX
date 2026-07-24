import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const usersUrl = new URL('./users.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('user registration never returns or exports a plaintext temporary password', async () => {
  const [usersApi, index] = await Promise.all([
    readFile(usersUrl, 'utf8'),
    readFile(indexUrl, 'utf8')
  ]);

  assert.doesNotMatch(usersApi, /temporary_password/);
  assert.doesNotMatch(index, /temporary_password/);
  assert.doesNotMatch(index, /임시비밀번호|초기 비밀번호/);
  assert.match(usersApi, /crypto\.randomBytes\(12\)/);
  assert.match(usersApi, /resetPasswordForEmail/);
});
