import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240012_cycle_emergency_governance.sql', import.meta.url);

test('pause and resume use dedicated guarded transitions with mandatory audit reasons', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /governance_pause_cycle/);
  assert.match(sql, /governance_resume_cycle/);
  assert.match(sql, /length\(v_reason\) < 5/);
  assert.match(sql, /set_config\('app\.cycle_status_transition', 'pause', true\)/);
  assert.match(sql, /set_config\('app\.cycle_status_transition', 'resume', true\)/);
  assert.match(sql, /evaluation_cycle_governance_audit/);
});

test('emergency close and cancellation require the protected super administrator', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of ['governance_force_close_cycle', 'governance_cancel_cycle']) {
    const body = sql.match(new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?end \\$\\$;`, 'i'))?.[0] ?? '';
    assert.match(body, /assert_cycle_governance_actor\(p_actor_id, true\)/);
  }
  assert.match(sql, /lower\(trim\(v_user\.email\)\) <> 'admin@cnhyex\.com'/);
  assert.match(sql, /results_published = false, result_gate_open = false/);
  assert.match(sql, /force_closed_by = p_actor_id, force_closed_at = now\(\), force_close_reason = v_reason/);
  assert.match(sql, /Force-closed cycles are retained without a publishable result snapshot/);
});

test('hard deletion rejects submitted cycles and cancellation preserves them', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const fn = sql.match(/create or replace function public\.governance_cancel_cycle[\s\S]*?end \$\$;/i)?.[0] ?? '';
  assert.match(fn, /select count\(\*\)::integer into v_submitted from public\.evaluations/);
  assert.match(fn, /if v_submitted > 0 then raise exception/);
  assert.match(fn, /status = '마감\/보관됨'/);
  assert.match(fn, /cancelled_by = p_actor_id, cancelled_at = now\(\), cancellation_reason = v_reason/);
  assert.match(fn, /request_status = 'cancelled'/);
});

test('admin API routes lifecycle mutations through authenticated RPCs', async () => {
  const source = await readFile(new URL('../api/admin-state.js', import.meta.url), 'utf8');
  for (const action of ['cycle_pause', 'cycle_resume', 'cycle_force_close', 'cycle_cancel']) {
    assert.match(source, new RegExp(action));
  }
  assert.match(source, /function requiredReason/);
  assert.match(source, /function assertSuperAdmin/);
  assert.match(source, /authenticatedRpcClient\(accessToken\)\.rpc\(rpcNames\[action\], args\)/);
});

test('executive progress payload exposes assignment status but not answer content', async () => {
  const source = await readFile(new URL('../api/admin-state.js', import.meta.url), 'utf8');
  assert.match(source, /matchings: \(matchings\.data \|\| \[\]\)\.map/);
  assert.match(source, /submitted_matching_ids: eligibleEvaluations\.map/);
  assert.match(source, /eligible_matching_ids: eligibleMatchings\.map/);
  assert.doesNotMatch(source, /select\('.*qualitative_comment.*'\)/);
});
