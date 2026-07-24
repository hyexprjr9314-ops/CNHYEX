import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const adminState = fs.readFileSync(new URL('../api/admin-state.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../supabase/migrations/202607250004_cycle_hard_delete_trigger_bypass.sql', import.meta.url),
  'utf8'
);

test('automatic matching uses only explicitly enabled users', () => {
  assert.match(adminState, /user\.can_evaluate === true/);
  assert.match(adminState, /user\.is_evaluatee === true/);
});

test('matching replacement returns the authoritative saved rows', () => {
  assert.match(adminState, /\.eq\('evaluator_id', evaluatorId\)[\s\S]*matchings: saved\.data \|\| \[\]/);
});

test('question creation requires an explicit evaluation cycle', () => {
  assert.match(index, /질문을 등록할 평가 주기를 먼저 선택해 주세요/);
  assert.doesNotMatch(index, /questionSelect \? parseInt\(questionSelect\.value\) : 1/);
});

test('existing users can be promoted to the executive system role', () => {
  assert.match(index, /id="edit-user-sysrole"[\s\S]*option value="임원"/);
  assert.match(index, /type: user\.type, sys_role: user\.sysRole/);
  assert.match(index, /u\.sysRole === '임원'[\s\S]*⚖️ 임원/);
});

test('hard delete has a transaction-local trigger bypass', () => {
  assert.match(migration, /current_setting\('app\.cycle_hard_delete', true\) = 'allowed'/);
  assert.match(migration, /set_config\('app\.cycle_hard_delete', 'allowed', true\)/);
});
