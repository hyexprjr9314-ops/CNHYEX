import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, allowedAdminSubtabs, canUseAdminAction } from '../api/role-policy.js';
test('role matrix separates regular, executive, and admin actions', () => {
  assert.equal(canUseAdminAction('', 'adjust'), false);
  assert.equal(canUseAdminAction(ROLES.admin, 'adjust'), true);
  assert.equal(canUseAdminAction(ROLES.executive, 'adjust'), false);
  assert.equal(canUseAdminAction(ROLES.executive, 'approve_adjustment'), true);
  assert.deepEqual(allowedAdminSubtabs(ROLES.executive), ['summary', 'history']);
});
