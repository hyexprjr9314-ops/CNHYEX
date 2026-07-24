import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRelativeGradePlan, cohortKeyForUser, largestRemainderAllocation } from './relative-grading.js';

test('largest remainder exactly allocates every cohort member', () => {
  const allocation = largestRemainderAllocation(17);
  assert.deepEqual(allocation.map(row => [row.grade, row.allocation_count]), [['S', 1], ['A', 3], ['B', 10], ['C', 2], ['D', 1]]);
  assert.equal(allocation.reduce((sum, row) => sum + row.allocation_count, 0), 17);
});

test('relative grades use effective score, raw score, then target id', () => {
  const entries = Array.from({ length: 20 }, (_, index) => ({ targetId: index + 1, rawScore: 70, effectiveFinalScore: 70, cohortKey: 'headquarters' }));
  entries[1].rawScore = 80;
  entries[2].effectiveFinalScore = 90;
  const plan = buildRelativeGradePlan(entries);
  assert.equal(plan.gradesByTargetId.get(3), 'S');
  assert.equal(plan.gradesByTargetId.get(2), 'A');
  assert.equal(plan.gradesByTargetId.get(1), 'A');
  assert.equal(plan.gradesByTargetId.get(20), 'D');
});

test('cohort assignment is limited to headquarters, branch, and mechanic groups', () => {
  assert.equal(cohortKeyForUser({ dept: '정비팀' }), 'mechanic');
  assert.equal(cohortKeyForUser({ workplace: '부산영업소' }), 'branch');
  assert.equal(cohortKeyForUser({ dept: '인사팀' }), 'headquarters');
});
