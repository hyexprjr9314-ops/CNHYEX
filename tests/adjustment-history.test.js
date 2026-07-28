import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607280003_adjustment_grade_history.sql', import.meta.url);
const apiUrl = new URL('../api/admin-state.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('adjustment audit events retain score, reason, and grade transitions without replacing existing RPCs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /add column if not exists previous_grade text/);
  assert.match(sql, /add column if not exists next_grade text/);
  assert.match(sql, /create trigger populate_adjustment_event_grades_before_insert/);
  assert.match(sql, /create trigger sync_latest_adjustment_event_grade_after_update/);
  assert.doesNotMatch(sql, /create or replace function public\.governance_adjust_final_score/);
});

test('privileged central state returns append-only adjustment events', async () => {
  const api = await readFile(apiUrl, 'utf8');

  assert.match(api, /from\('evaluation_result_adjustment_events'\)/);
  assert.match(api, /\.select\('\*'\)[\s\S]*\.order\('occurred_at'/);
  assert.match(api, /adjustment_events: adjustmentEvents\.data \|\| \[\]/);
});

test('summary and archive adjustment badges open the complete reason history', async () => {
  const html = await readFile(indexUrl, 'utf8');

  assert.match(html, /id="modal-adjustment-history"/);
  assert.match(html, /function openAdjustmentHistoryModal\(targetId, cycleId = currentSelectedSummaryCycleId\)/);
  assert.match(html, /adjustmentEventsDb[\s\S]*\.filter\(event => Number\(event\.target_id\)/);
  assert.match(html, /조정됨\$\{gradeOverrideLabel\}/);
  assert.match(html, /조정 사유와 전체 이력 보기/);
  assert.match(html, /events\.length - index/);
});
