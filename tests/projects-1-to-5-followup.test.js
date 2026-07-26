import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const adminApi = await readFile(new URL('../api/admin-state.js', import.meta.url), 'utf8');
const resultApi = await readFile(new URL('../api/result-state.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202607260004_three_step_approval_notifications.sql', import.meta.url), 'utf8');

test('question filters include the branch employee track and normalize stored values', () => {
  assert.match(index, /id="q-track-tab-영업소 직원"/);
  assert.match(index, /normalizeQuestionTrack\(q\.targetTrack\) === normalizeQuestionTrack\(currentSelectedQuestionTrack\)/);
});

test('publication control always renders from the selected cycle state', () => {
  assert.match(index, /const published = cycle\?\.results_published === true/);
  assert.match(index, /결과 비공개 \(클릭 시 공개\)/);
  assert.match(index, /const nextPublished = selectedCycle\.results_published !== true/);
});

test('management tabs put permissions before questions', () => {
  assert.ok(index.indexOf('id="admin-tab-permissions"') < index.indexOf('id="admin-tab-questions"'));
});

test('question CSV upload supports a validated drop path', () => {
  assert.match(index, /id="csv-question-dropzone"/);
  assert.match(index, /ondrop="handleCSVQuestionDrop\(event\)"/);
  assert.match(index, /function processCSVQuestionFile\(file\)/);
});

test('approval supports one to three approvers with persistent notifications', () => {
  assert.match(index, /id="approval-step-three"/);
  assert.match(resultApi, /ids\.length > 3/);
  assert.match(migration, /step_order between 1 and 3/);
  assert.match(migration, /cardinality\(p_approver_ids\) not between 1 and 3/);
  assert.match(migration, /create table if not exists public\.evaluation_notifications/);
  assert.match(adminApi, /notifications: notifications\.data \|\| \[\]/);
  assert.match(index, /id="modal-notification-center"/);
  assert.match(index, /결재 진행 기록 보기/);
});
