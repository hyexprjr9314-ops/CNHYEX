import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  allowedAdminSubtabs,
  allowedClosingManagementSubtabs,
  allowedEvaluationSetupSubtabs,
  canUseAdminAction
} from '../api/role-policy.js';
test('role matrix separates regular, executive, and admin actions', () => {
  assert.equal(canUseAdminAction('', 'adjust'), false);
  assert.equal(canUseAdminAction(ROLES.admin, 'adjust'), true);
  assert.equal(canUseAdminAction(ROLES.executive, 'adjust'), false);
  assert.equal(canUseAdminAction(ROLES.executive, 'adjust_final'), true);
  assert.equal(canUseAdminAction(ROLES.admin, 'adjust_final'), true);
  assert.equal(canUseAdminAction(ROLES.executive, 'cancel_adjustment'), true);
  assert.deepEqual(allowedEvaluationSetupSubtabs(ROLES.admin), ['cycles', 'permissions', 'questions', 'matching', 'lifecycle']);
  assert.deepEqual(allowedEvaluationSetupSubtabs(ROLES.executive), []);
  assert.deepEqual(allowedClosingManagementSubtabs(ROLES.admin), ['progress', 'summary', 'history']);
  assert.deepEqual(allowedClosingManagementSubtabs(ROLES.executive), ['progress', 'summary', 'history']);
  assert.deepEqual(allowedAdminSubtabs(ROLES.executive), ['progress', 'summary', 'history']);
});
