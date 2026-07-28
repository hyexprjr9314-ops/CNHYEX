import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRelativeGradePlan, cohortKeyForUser, largestRemainderAllocation } from '../api/relative-grading.js';

test('largest remainder exactly allocates every cohort member', () => {
  const allocation = largestRemainderAllocation(17);
  assert.deepEqual(allocation.map(row => [row.grade, row.allocation_count]), [['S', 1], ['A', 3], ['B', 10], ['C', 2], ['D', 1]]);
  assert.equal(allocation.reduce((sum, row) => sum + row.allocation_count, 0), 17);
});

test('cohorts of ten or more always allocate at least one S and one D', () => {
  const allocation = largestRemainderAllocation(10);
  const counts = Object.fromEntries(allocation.map(row => [row.grade, row.allocation_count]));
  assert.equal(counts.S, 1);
  assert.equal(counts.D, 1);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 10);
});

test('an initial perfect raw score receives EX outside the relative quota even after adjustment', () => {
  const plan = buildRelativeGradePlan([
    { targetId: 1, cohortKey: 'headquarters', rawScore: 100, effectiveFinalScore: 100, isAdjusted: false },
    { targetId: 2, cohortKey: 'headquarters', rawScore: 100, effectiveFinalScore: 70, isAdjusted: true },
    { targetId: 3, cohortKey: 'headquarters', rawScore: 90, effectiveFinalScore: 90, isAdjusted: false }
  ]);
  assert.equal(plan.gradesByTargetId.get(1), 'EX');
  assert.equal(plan.gradesByTargetId.get(2), 'EX');
  assert.equal(plan.allocations.reduce((sum, row) => sum + row.allocation_count, 0), 1);
});

test('relative grades freeze on raw score and ignore later adjusted scores', () => {
  const entries = Array.from({ length: 20 }, (_, index) => ({ targetId: index + 1, rawScore: 70, effectiveFinalScore: 70, cohortKey: 'headquarters' }));
  entries[1].rawScore = 80;
  entries[2].effectiveFinalScore = 90;
  const plan = buildRelativeGradePlan(entries);
  assert.equal(plan.gradesByTargetId.get(2), 'S');
  assert.equal(plan.gradesByTargetId.get(1), 'A');
  assert.equal(plan.gradesByTargetId.get(3), 'A');
  assert.equal(plan.gradesByTargetId.get(20), 'D');
});

test('cohort assignment is limited to headquarters, branch, and mechanic groups', () => {
  assert.equal(cohortKeyForUser({ dept: '정비팀' }), 'mechanic');
  assert.equal(cohortKeyForUser({ workplace: '부산영업소' }), 'branch');
  assert.equal(cohortKeyForUser({ dept: '인사팀' }), 'headquarters');
});

test('database approval freezes peer grades on raw score and applies overrides only to the selected target', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607280001_freeze_initial_relative_grades.sql', import.meta.url), 'utf8');
  assert.match(migration, /order by r\.raw_score desc,r\.target_id/);
  assert.doesNotMatch(migration, /order by r\.effective_score desc/);
  assert.match(migration, /set approved_grade=coalesce/);
  assert.match(migration, /set final_grade=r\.approved_grade/);
  assert.match(migration, /update public\.evaluation_archives archive/);
});
