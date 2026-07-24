import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240013_paused_matching_and_approval_lines.sql', import.meta.url);
const adminStateUrl = new URL('../api/admin-state.js', import.meta.url);
const resultStateUrl = new URL('../api/result-state.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('paused matching edits use guarded governance RPCs and preserve submitted assignments', async () => {
  const [sql, api, index] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(adminStateUrl, 'utf8'),
    readFile(indexUrl, 'utf8')
  ]);
  assert.match(api, /action !== 'matching_generate'[\s\S]*cycle\.data\.status === '일시정지'/);
  assert.match(api, /governance_toggle_paused_matching/);
  assert.match(api, /governance_replace_paused_matchings/);
  assert.match(sql, /current_setting\('app\.paused_matching_change', true\) = 'allowed'/);
  assert.match(sql, /exists \(select 1 from public\.evaluations where matching_id = v_existing\.id\)/);
  assert.match(sql, /not exists \(select 1 from public\.evaluations e where e\.matching_id = m\.id\)/);
  assert.match(sql, /evaluation_matching_change_audit/);
  assert.match(sql, /length\(trim\(reason\)\) >= 5/);
  assert.match(index, /일시정지 중 매칭 변경 사유를 5자 이상 입력해 주세요/);
  assert.match(index, /target_ids: targetIds,\s*reason/);
});

test('approval line is sequential, bounded to executives, recallable only before a decision', async () => {
  const [sql, api, adminApi] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(resultStateUrl, 'utf8'),
    readFile(adminStateUrl, 'utf8')
  ]);
  assert.match(api, /approver_user_ids/);
  assert.match(api, /governance_recall_approval/);
  assert.match(sql, /cardinality\(p_approver_ids\) not between 1 and 2/);
  assert.match(sql, /u\.sys_role::text = '임원'/);
  assert.match(sql, /order by step_order limit 1 for update/);
  assert.match(sql, /v_step\.approver_id is distinct from p_actor_id/);
  assert.match(sql, /Approval cannot be recalled after the first decision/);
  assert.match(adminApi, /approval_requests: approvalLines/);
  assert.match(adminApi, /pending_approval_notifications: pendingApprovalNotifications/);
  assert.match(adminApi, /visibleApprovalRequests/);
  assert.match(sql, /Approval line migration: resubmission required/);
});
