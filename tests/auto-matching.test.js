import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedMatchingPair, planAutoMatchings } from '../api/auto-matching.js';

const user = (id, overrides = {}) => ({
  id, name: `u${id}`, active: true, can_evaluate: true, is_evaluatee: true,
  company: '한양고속', dept: '인사ㆍ총무', workplace: '본사', type: '팀원급',
  ...overrides
});

test('branch team members are matched only with cross-company team members', () => {
  const branchTarget = user(20, { workplace: '천안영업소' });
  const sameCompanyBranch = user(21, { workplace: '아산영업소' });
  const affiliateHeadquarters = user(22, { company: '충남고속' });
  const affiliateBranch = user(23, { company: '충남고속', workplace: '서산영업소' });
  const affiliateLeader = user(24, { company: '충남고속', type: '팀장/부서장급' });
  assert.equal(allowedMatchingPair(sameCompanyBranch, branchTarget), false);
  assert.equal(allowedMatchingPair(affiliateHeadquarters, branchTarget), true);
  assert.equal(allowedMatchingPair(affiliateBranch, branchTarget), true);
  assert.equal(allowedMatchingPair(affiliateLeader, branchTarget), false);

  const result = planAutoMatchings({
    cycleId: 11,
    users: [branchTarget, sameCompanyBranch, affiliateHeadquarters, affiliateBranch, affiliateLeader],
    existing: [], submittedMatchingIds: []
  });
  const assigned = result.generated.filter(row => row.target_id === branchTarget.id);
  assert.deepEqual(new Set(assigned.map(row => row.evaluator_id)), new Set([22, 23]));
  assert.equal(result.shortages.some(row => row.target_id === branchTarget.id && row.bucket === 'affiliate_peer'), true);
});

test('quota matching preserves manual rows, balances load, and reports shortages', () => {
  const users = [
    user(1), user(2), user(3),
    user(4, { dept: '사업' }),
    user(5, { company: '충남고속' }),
    user(6, { company: '충남고속', dept: '사업' }),
    user(7, { type: '팀장/부서장급' }),
    user(8, { type: '임원급', sys_role: 'executive' })
  ];
  const result = planAutoMatchings({
    cycleId: 9,
    users,
    existing: [{ id: 1, evaluator_id: 2, target_id: 1, type: '관리자 수동 지정' }],
    submittedMatchingIds: []
  });
  const forTarget = result.generated.filter(row => row.target_id === 1);
  assert.equal(forTarget.some(row => row.evaluator_id === 2), false);
  assert.equal(forTarget.some(row => row.evaluator_id === 8), false);
  assert.equal(forTarget.length, 5);
  assert.deepEqual(new Set(forTarget.map(row => row.relationship_type)), new Set(['internal', 'exchange']));
  assert.ok(result.shortages.every(row => row.assigned < row.required));
});

test('submitted automatic rows are fixed and deducted from quota', () => {
  const users = [user(1), user(2), user(3)];
  const result = planAutoMatchings({
    cycleId: 1,
    users,
    existing: [{ id: 10, evaluator_id: 2, target_id: 1, type: '알고리즘 자동 지정' }],
    submittedMatchingIds: [10]
  });
  assert.equal(result.generated.filter(row => row.target_id === 1 && row.evaluator_id === 2).length, 0);
  assert.equal(result.generated.filter(row => row.target_id === 1).length, 1);
});
