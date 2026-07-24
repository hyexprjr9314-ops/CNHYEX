import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyImmutableFinalResults, applyRelativeGrades, assertGlobalConfigurationMutable } from './admin-state.js';

function score(finalScore) {
  return {
    raw: finalScore,
    final: finalScore,
    grade: 'EX',
    grade_status: null,
    complete: true
  };
}

test('summary grades use relative quotas and archived grades take precedence', () => {
  const users = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    active: true,
    is_evaluatee: true,
    dept: 'management'
  }));
  const scores = {
    1: Object.fromEntries(users.map(user => [user.id, score(100 - user.id)]))
  };

  applyRelativeGrades(scores, users, []);

  const grades = Object.values(scores[1]).map(entry => entry.grade);
  assert.deepEqual(
    ['S', 'A', 'B', 'C', 'D'].map(grade => grades.filter(value => value === grade).length),
    [1, 4, 12, 2, 1]
  );
  assert.equal(grades.includes('EX'), false);
  assert.equal(scores[1][1].grade_status, 'provisional');

  applyRelativeGrades(scores, users, [{ cycle_id: 1, snapshot: [{ id: 1, grade: 'D' }] }]);
  assert.equal(scores[1][1].grade, 'D');
  assert.equal(scores[1][1].grade_status, 'final');
});

test('current immutable final result overwrites live scores only for its matching cycle version', () => {
  const scores = { 9: { 41: score(72) } };
  const cycles = new Map([[9, { result_version: 3 }]]);
  applyImmutableFinalResults(scores, [
    { cycle_id: 9, target_id: 41, result_version: 2, raw_score: 1, effective_score: 1, relative_grade: 'D' },
    {
      cycle_id: 9, target_id: 41, result_version: 3, raw_score: 84.5, effective_score: 88.5,
      relative_grade: 'A', category_labels: ['성과'], category_scores: { performance: 90, collaboration: 80 }
    }
  ], cycles);
  assert.equal(scores[9][41].raw, 84.5);
  assert.equal(scores[9][41].final, 88.5);
  assert.equal(scores[9][41].grade, 'A');
  assert.equal(scores[9][41].grade_status, 'final');
  assert.equal(scores[9][41].performance, 90);
  assert.equal(scores[9][41].collaboration, 80);
});

test('cycle finalization sends only the authenticated cycle and actor to the DB-owned finalizer', async () => {
  const source = await readFile(new URL('./admin-state.js', import.meta.url), 'utf8');
  assert.match(source, /rpc\('governance_finalize_cycle', \{\s*p_cycle_id: cycleId,\s*p_actor_id: authUser\.id\s*\}\)/s);
  assert.doesNotMatch(source, /p_final_results:/);
  assert.doesNotMatch(source, /p_snapshot:/);
});

function cycleListService(cycles) {
  return {
    from(table) {
      assert.equal(table, 'evaluation_cycles');
      return { select: async () => ({ data: cycles, error: null }) };
    }
  };
}

test('global category weights remain locked while a current cycle is active or in approval', async () => {
  await assert.doesNotReject(() => assertGlobalConfigurationMutable(cycleListService([
    { id: 1, status: '초안', internal_approval_status: 'not_requested' },
    { id: 2, status: '마감/보관됨', internal_approval_status: 'approved' }
  ])));
  await assert.rejects(
    () => assertGlobalConfigurationMutable(cycleListService([{ id: 1, status: '진행중', internal_approval_status: 'not_requested' }])),
    error => error.status === 409
  );
  await assert.rejects(
    () => assertGlobalConfigurationMutable(cycleListService([
      { id: 1, status: '초안', internal_approval_status: 'not_requested' },
      { id: 2, status: '진행중', internal_approval_status: 'not_requested' }
    ])),
    error => error.status === 409
  );
  await assert.rejects(
    () => assertGlobalConfigurationMutable(cycleListService([{ id: 1, status: '초안', internal_approval_status: 'requested' }])),
    error => error.status === 409
  );
});
