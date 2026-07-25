import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const usersUrl = new URL('../api/users.js', import.meta.url);

test('executive type disables evaluation and leaving executive type restores it', async () => {
  const source = await readFile(usersUrl, 'utf8');
  const policy = source.match(/function applyEmployeeTypePermissions\([\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(policy, /profile\.type === '임원급'/);
  assert.match(policy, /profile\.can_evaluate = false/);
  assert.match(policy, /profile\.is_evaluatee = false/);
  assert.match(policy, /previousType === '임원급'/);
  assert.match(policy, /profile\.can_evaluate = true/);
  assert.match(policy, /profile\.is_evaluatee = true/);
});
