import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('automatic matching creates an atomic quota draft that remains manually editable', async () => {
  const [api, autoMatching, ui, migration] = await Promise.all([
    read('../api/admin-state.js'),
    read('../api/auto-matching.js'),
    read('../index.html'),
    read('../supabase/migrations/202607260001_quota_auto_matching.sql')
  ]);

  assert.match(api, /governance_replace_auto_matchings/);
  assert.match(api, /governance_replace_draft_matchings/);
  assert.match(api, /schema cache\|could not find/);
  assert.match(autoMatching, /const needed = Math\.max\(0, rule\.quota - already\)/);
  assert.match(autoMatching, /load\.get\(Number\(a\.id\)\)/);
  assert.match(ui, /action:\s*'matching_generate'/);
  assert.match(ui, /정원 기반 자동 초안 생성/);
  assert.doesNotMatch(ui, /saveBtn\.disabled = !dirty \|\| isAutoMatchingEnabled/);
  assert.match(migration, /alter column auto_matching_enabled set default false/i);
  assert.match(migration, /delete from public\.matchings[\s\S]*insert into public\.matchings/i);
});

test('cycle validation groups repeated question gaps into actionable scopes', async () => {
  const ui = await read('../index.html');
  assert.match(ui, /formatCycleValidationReportGrouped/);
  assert.match(ui, /issue\.target_track/);
  assert.match(ui, /issue\.relationship_type/);
  assert.match(ui, /issue\.category/);
});

test('cycle validation delegates question coverage to the cycle-scoped dynamic validator', async () => {
  const sql = await read('../supabase/migrations/202607250006_unify_cycle_validation.sql');
  assert.match(sql, /create or replace function public\.validate_evaluation_cycle\(p_cycle_id bigint\)/i);
  assert.match(sql, /public\.validate_cycle_question_coverage\(p_cycle_id\)/i);
  assert.match(sql, /count\(distinct m\.target_id\)/i);
  assert.doesNotMatch(sql, /array\['성과','협업','성장','조화'\]/);
  assert.match(sql, /'counts'/i);
  assert.match(sql, /v_issues\s*:=\s*v_issues\s*\|\|\s*coalesce\(v_coverage->'issues'/i);
  assert.match(sql, /create or replace function public\.activate_evaluation_cycle[\s\S]*v_report := public\.validate_evaluation_cycle\(p_cycle_id\)/i);
});
