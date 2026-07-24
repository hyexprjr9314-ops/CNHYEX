import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240009_cycle_lifecycle_and_profile_integrity.sql', import.meta.url);

async function source() {
  return readFile(migrationUrl, 'utf8');
}

test('009 replaces the invalid CASE/RAISE submission branch with a procedural track helper', async () => {
  const sql = await source();
  const helper = sql.match(/create or replace function public\.canonical_category_names_for_track[\s\S]*?\$\$;/i)?.[0] ?? '';
  const submit = sql.match(/create or replace function public\.submit_evaluation_central[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(helper, /if p_track = 'headquarters_member'/);
  assert.match(helper, /raise exception 'Unknown question track: %'/);
  assert.match(submit, /v_categories := public\.canonical_category_names_for_track\(v_target_track\)/);
  assert.doesNotMatch(submit, /else\s+raise exception/i);
});

test('source and profile locks cover both cycle movement directions and active assignments', async () => {
  const sql = await source();
  const sourceTrigger = sql.match(/create or replace function public\.prevent_non_draft_cycle_source_mutation[\s\S]*?\$\$;/i)?.[0] ?? '';
  const profileTrigger = sql.match(/create or replace function public\.prevent_profile_classification_mutation_while_cycle_locked[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(sourceTrigger, /array\[old\.cycle_id, new\.cycle_id\]/i);
  assert.match(sourceTrigger, /c\.id = any\(v_cycle_ids\)/i);
  for (const field of ['role', 'company', 'dept', 'workplace', 'type', 'is_evaluatee', 'can_evaluate']) {
    assert.match(profileTrigger, new RegExp(`new\\.${field} is not distinct from old\\.${field}`, 'i'));
  }
  assert.match(profileTrigger, /m\.evaluator_id = old\.id or m\.target_id = old\.id/i);
  assert.match(sql, /users_prevent_profile_classification_mutation/i);
});

test('weight lock allows clean drafts and historical archives but blocks live or approval-started work', async () => {
  const sql = await source();
  const fn = sql.match(/create or replace function public\.prevent_weight_change_while_cycle_non_draft[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(fn, /c\.status not in \('마감\/보관됨', 'closed'\)/);
  assert.match(fn, /c\.status is distinct from '초안' or c\.internal_approval_status is distinct from 'not_requested'/);
});

test('only dedicated RPCs can activate or finalize a cycle status', async () => {
  const sql = await source();
  const trigger = sql.match(/create or replace function public\.prevent_direct_cycle_status_transition[\s\S]*?\$\$;/i)?.[0] ?? '';
  const activate = sql.match(/create or replace function public\.activate_evaluation_cycle[\s\S]*?\$\$;/i)?.[0] ?? '';
  const finalize = sql.match(/create or replace function public\.governance_finalize_cycle[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(trigger, /new\.status = '진행중' and v_transition = 'activate'/i);
  assert.match(trigger, /new\.status = '마감\/보관됨' and v_transition = 'finalize'/i);
  assert.match(activate, /set_config\('app\.cycle_status_transition', 'activate', true\)/i);
  assert.match(finalize, /set_config\('app\.cycle_status_transition', 'finalize', true\)/i);
  assert.match(sql, /evaluation_cycles_prevent_direct_status_transition/i);
});

test('finalizer uses leader-first category labels separately from the work-area grading cohort', async () => {
  const sql = await source();
  const finalizer = sql.match(/create or replace function public\.governance_finalize_cycle[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.match(finalizer, /public\.evaluation_cohort_key_for_profile\(u\.dept,u\.workplace\)/);
  assert.match(finalizer, /public\.canonical_category_labels_for_profile\(u\.type::text,u\.role,u\.dept,u\.workplace\)/);
  assert.match(sql, /canonical_question_track_for_profile\(p_employee_type, p_role, p_dept, p_workplace\)/);
});
