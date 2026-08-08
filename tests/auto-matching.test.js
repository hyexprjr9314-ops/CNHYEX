import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedMatchingPair, MAX_STANDARD_TARGETS, planAutoMatchings } from '../api/auto-matching.js';

const user = (id, overrides = {}) => ({
  id, name: `u${id}`, active: true, can_evaluate: true, is_evaluatee: true,
  company: '한양고속', dept: '인사ㆍ총무', workplace: '본사', type: '팀원급', ...overrides
});

test('branch team members stay in the exact branch and include internal plus affiliate peers', () => {
  const target = user(20, { workplace: '영업소', dept: '천안' });
  const internal = user(21, { workplace: '천안영업소', dept: '천안' });
  const affiliate = user(22, { company: '충남고속', workplace: '영업소', dept: '천안' });
  const wrongBranch = user(23, { company: '충남고속', workplace: '서산영업소', dept: '서산' });
  assert.equal(allowedMatchingPair(internal, target), true);
  assert.equal(allowedMatchingPair(affiliate, target), true);
  assert.equal(allowedMatchingPair(wrongBranch, target), false);

  const result = planAutoMatchings({ cycleId: 11, users: [target, internal, affiliate, wrongBranch], existing: [], submittedMatchingIds: [] });
  assert.deepEqual(new Set(result.generated.filter(row => row.target_id === target.id).map(row => row.evaluator_id)), new Set([21, 22]));
});

test('branch leaders and same-company branch mechanics remain bidirectional exceptions', () => {
  const member = user(40, { workplace: '영업소', dept: '태안' });
  const leader = user(41, { workplace: '태안영업소', dept: '태안', type: '팀장/부서장급' });
  const mechanic = user(42, { workplace: '태안영업소', dept: '태안', type: '정비사' });
  assert.equal(allowedMatchingPair(member, leader), true);
  assert.equal(allowedMatchingPair(leader, member), true);
  assert.equal(allowedMatchingPair(member, mechanic), true);
  assert.equal(allowedMatchingPair(mechanic, member), true);
});

test('mechanic peers require the same company and department', () => {
  const target = user(30, { type: '정비사', dept: '정비팀' });
  const sameGroup = user(31, { type: '정비사', dept: '정비팀' });
  const otherDepartment = user(32, { type: '정비사', dept: '천안' });
  const affiliate = user(33, { type: '정비사', dept: '정비팀', company: '충남고속' });
  assert.equal(allowedMatchingPair(sameGroup, target), true);
  assert.equal(allowedMatchingPair(otherDepartment, target), false);
  assert.equal(allowedMatchingPair(affiliate, target), false);
  const result = planAutoMatchings({ cycleId: 4, users: [target, sameGroup, otherDepartment, affiliate], existing: [], submittedMatchingIds: [] });
  assert.deepEqual(result.generated.filter(row => row.target_id === target.id).map(row => row.evaluator_id), [31]);
});

test('legacy team-member maintenance profiles are still treated as mechanics', () => {
  const target = user(50, { role: '촉탁정비원', dept: '정비' });
  const sameGroup = user(51, { role: '정비사', dept: '정비' });
  const affiliate = user(52, { role: '정비사', dept: '정비', company: '충남고속' });
  assert.equal(allowedMatchingPair(sameGroup, target), true);
  assert.equal(allowedMatchingPair(affiliate, target), false);
  const result = planAutoMatchings({ cycleId: 5, users: [target, sameGroup, affiliate], existing: [], submittedMatchingIds: [] });
  assert.deepEqual(result.generated.filter(row => row.target_id === target.id).map(row => row.evaluator_id), [51]);
});

test('office matching excludes same-company other departments and caps ordinary loads', () => {
  const users = [user(1), ...Array.from({ length: 12 }, (_, index) => user(index + 2)),
    user(20, { dept: '사업' }), user(21, { company: '충남고속' }),
    user(22, { company: '충남고속', dept: '사업' }), user(23, { type: '팀장/부서장급' })];
  const result = planAutoMatchings({ cycleId: 9, users, existing: [], submittedMatchingIds: [] });
  const forTarget = result.generated.filter(row => row.target_id === 1);
  assert.equal(forTarget.some(row => row.evaluator_id === 20 || row.evaluator_id === 22), false);
  assert.ok(forTarget.length <= MAX_STANDARD_TARGETS);
  const loads = new Map();
  result.generated.forEach(row => loads.set(row.evaluator_id, (loads.get(row.evaluator_id) || 0) + 1));
  for (const evaluator of users.filter(row => row.type !== '팀장/부서장급')) assert.ok((loads.get(evaluator.id) || 0) <= MAX_STANDARD_TARGETS);
});

test('submitted automatic and manual rows are preserved and deducted from capacity', () => {
  const users = [user(1), user(2), user(3)];
  const result = planAutoMatchings({
    cycleId: 1, users,
    existing: [
      { id: 10, evaluator_id: 2, target_id: 1, type: '알고리즘 자동 지정' },
      { id: 11, evaluator_id: 3, target_id: 1, type: '관리자 수동 지정' }
    ],
    submittedMatchingIds: [10]
  });
  assert.equal(result.generated.some(row => row.target_id === 1 && [2, 3].includes(row.evaluator_id)), false);
});
