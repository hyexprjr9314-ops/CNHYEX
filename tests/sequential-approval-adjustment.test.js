import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607280002_sequential_approval_adjustments.sql', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('only the current approval-line executive can adjust a requested result', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /v_cycle\.internal_approval_status <> 'requested'/);
  assert.match(sql, /v_role <> '임원'/);
  assert.match(sql, /request_status = 'requested'/);
  assert.match(sql, /status = 'pending'[\s\S]*order by step_order[\s\S]*limit 1/);
  assert.match(sql, /v_step\.approver_id is distinct from p_actor_id/);
});

test('approval-stage adjustment synchronizes immutable results, history, and audit atomically', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /update public\.evaluation_final_results[\s\S]*effective_score = p_final_score/);
  assert.match(sql, /approved_grade = coalesce\(v_grade, relative_grade\)/);
  assert.match(sql, /update public\.evaluation_archives archive[\s\S]*jsonb_array_elements/);
  assert.match(sql, /evaluation_result_adjustment_events/);
  assert.match(sql, /evaluation_adjustment_workflow_audit/);
  assert.match(sql, /for update/);
  assert.doesNotMatch(sql, /update public\.evaluation_final_results[\s\S]*relative_grade\s*=/);
});

test('summary adjustment controls follow the current approval step without changing role navigation', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /function currentApprovalAdjustmentAccess\(\)/);
  assert.match(html, /Number\(request\?\.current_approver_user_id\) === Number\(currentLoggedInUser\?\.id\)/);
  assert.match(html, /isCurrentApprover \? '' : \(roleInfo\.isAdmin \? '전자결재 진행 중' : '결재 차례 대기'\)/);
  assert.match(html, /access\.approvalActive \? '' :/);
});
