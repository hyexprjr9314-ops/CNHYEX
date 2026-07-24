import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('administrator progress dashboard uses eligible server assignments and submitted matching ids', async () => {
  const [index, api] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../api/admin-state.js', import.meta.url), 'utf8')
  ]);

  assert.match(index, /id="admin-tab-progress"/);
  assert.match(index, /id="admin-subtab-progress"/);
  assert.match(index, /function renderEvaluationProgress\(\)/);
  assert.match(index, /eligibleMatchingIds\.has\(Number\(row\.id\)\)/);
  assert.match(index, /submittedMatchingIds\.has\(Number\(row\.id\)\)/);
  assert.match(index, /평가자·피평가자 이름 검색/);
  assert.match(index, /피평가자별 수집 현황/);

  assert.match(api, /submitted_matching_ids:/);
  assert.match(api, /eligible_matching_ids:/);
  assert.match(api, /profile\.sys_role === ROLES\.admin/);
});
