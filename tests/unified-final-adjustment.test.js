import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607250008_unified_final_adjustment.sql', import.meta.url);
const detailApiUrl = new URL('../api/evaluation-detail.js', import.meta.url);

test('unified adjustment preserves the existing terminal workflow contract', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create or replace function public\.governance_adjust_final_score/);
  assert.match(sql, /v_role not in \('관리자', '임원'\)/);
  assert.match(sql, /workflow_status='second_stage_adjusted'/);
  assert.match(sql, /v_submitted_count <> v_assigned_count/);
  assert.match(sql, /category_weight_for_target/);
  assert.doesNotMatch(sql, /p_raw_score/);
  assert.match(sql, /on conflict \(cycle_id,target_id\) do update/);
  assert.match(sql, /evaluation_result_adjustment_events/);
  assert.match(sql, /evaluation_adjustment_workflow_audit/);
  assert.doesNotMatch(sql, /drop column|drop table|delete from public\.evaluation_result_adjustments/);
});

test('evaluation detail is server-owned and privileged', async () => {
  const source = await readFile(detailApiUrl, 'utf8');
  assert.match(source, /ROLES\.admin, ROLES\.executive/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /assigned_count: assignments\.length/);
  assert.match(source, /submitted_count: submitted\.length/);
  assert.match(source, /feedback: evaluation\?\.qualitative_comment/);
});
