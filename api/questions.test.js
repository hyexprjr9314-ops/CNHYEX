import assert from 'node:assert/strict';
import test from 'node:test';
import { assertQuestionCyclesMutable, normalizeQuestionRows } from './questions.js';

function cycleService(cycles) {
  return {
    from(table) {
      assert.equal(table, 'evaluation_cycles');
      return {
        select() { return this; },
        in(_column, _ids) { return Promise.resolve({ data: cycles, error: null }); }
      };
    }
  };
}

test('CSV question rows normalize the same defaults as the question editor', () => {
  const [row] = normalizeQuestionRows([{ cycle_id: '7', category: '성과', weight: '25', text: '질문' }]);
  assert.deepEqual(row, {
    cycle_id: 7, category: '성과', target_track: 'all', target_dept: '전체',
    type: '5지선다형', audience: 'all', weight: 25, text: '질문', required: true, is_default: true, max_score: 5
  });
});

test('CSV question import rejects a closed or approval-pending cycle before writes', async () => {
  await assert.rejects(
    () => assertQuestionCyclesMutable(cycleService([{ id: 7, status: '마감/보관됨', internal_approval_status: 'not_requested' }]), [7]),
    error => error.status === 409
  );
  await assert.rejects(
    () => assertQuestionCyclesMutable(cycleService([{ id: 7, status: '진행중', internal_approval_status: 'requested' }]), [7]),
    error => error.status === 409
  );
});

test('CSV question import accepts only a known draft cycle', async () => {
  assert.deepEqual(
    await assertQuestionCyclesMutable(cycleService([{ id: 7, status: '초안', internal_approval_status: 'not_requested' }]), [7, '7']),
    [7]
  );
  await assert.rejects(
    () => assertQuestionCyclesMutable(cycleService([{ id: 7, status: '진행중', internal_approval_status: 'not_requested' }]), [7]),
    error => error.status === 409
  );
  await assert.rejects(() => assertQuestionCyclesMutable(cycleService([]), [7]), error => error.status === 404);
});
