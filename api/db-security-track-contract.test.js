import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240008_db_security_and_track_contract.sql', import.meta.url);

async function source() {
  return readFile(migrationUrl, 'utf8');
}

test('database contract retires the arbitrary-score legacy submit RPC', async () => {
  const sql = await source();
  assert.match(sql, /drop function if exists public\.submit_evaluation\(bigint,numeric,numeric,numeric,numeric,text\)/i);
  assert.doesNotMatch(sql, /grant execute on function public\.submit_evaluation\(bigint,numeric,numeric,numeric,numeric,text\)/i);
});

test('central submission serializes with finalization by locking the cycle row', async () => {
  const sql = await source();
  assert.match(sql, /create or replace function public\.submit_evaluation_central[\s\S]*?from public\.evaluation_cycles c[\s\S]*?for update/is);
  assert.match(sql, /c\.status\s*=\s*'진행중'/);
  assert.match(sql, /scoring_version\s*=\s*excluded\.scoring_version/);
});

test('track aliases preserve UI labels and leadership is classified before branch or maintenance', async () => {
  const sql = await source();
  const helper = sql.match(/create or replace function public\.canonical_question_track_for_profile[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.ok(helper.indexOf("then 'headquarters_leader'") < helper.indexOf("then 'mechanic'"));
  for (const label of ['본사 팀원급', '팀장/부서장급', '팀장·부서장급', '영업소', '영업소 직원', '정비사']) assert.ok(sql.includes(`when '${label}'`));
  assert.match(sql, /evaluation_cohort_key_for_profile/);
  assert.match(sql, /public\.question_track_applies\(q\.target_track, rc\.target_track\)/);
});

test('activation and submission require dynamic track categories, not legacy category fallback', async () => {
  const sql = await source();
  assert.match(sql, /Each configured track category needs a positively weighted multiple-choice question/);
  assert.match(sql, /Dynamic coverage has no legacy fixed-category fallback/);
  assert.match(sql, /v_coverage := public\.validate_cycle_question_coverage\(p_cycle_id\)/);
  assert.match(sql, /if v_cycle\.status is distinct from '초안'/);
});

test('post-draft source and weight mutations are trigger-guarded even for service role APIs', async () => {
  const sql = await source();
  for (const token of [
    'prevent_non_draft_cycle_source_mutation',
    'evaluation_questions_prevent_non_draft_mutation',
    'matchings_prevent_non_draft_mutation',
    "c.status is distinct from '초안'",
    'prevent_weight_change_while_cycle_non_draft',
    'evaluation_settings_prevent_weight_mutation'
  ]) assert.ok(sql.includes(token), `missing ${token}`);
});

test('privileged list and summary RPCs are fail-closed and ACLs are explicit', async () => {
  const sql = await source();
  for (const fn of ['admin_list_users', 'executive_list_users', 'executive_cycle_governance_summary']) {
    const definition = sql.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`, 'i'))?.[0] ?? '';
    assert.match(definition, /coalesce\(\(select u\.sys_role::text/);
    assert.match(definition, /u\.active is true/);
  }
  assert.match(sql, /revoke all on function public\.submit_evaluation_central[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_evaluation_central[\s\S]*?to authenticated/i);
  assert.match(sql, /grant execute on function public\.admin_list_users\(\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.activate_evaluation_cycle\(bigint\) to service_role/i);
});
