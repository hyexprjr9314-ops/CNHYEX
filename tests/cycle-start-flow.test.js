import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('automatic matching is idempotent and matching mode belongs to a cycle', async () => {
  const [api, ui, migration] = await Promise.all([
    read('../api/admin-state.js'),
    read('../index.html'),
    read('../supabase/migrations/202607250003_cycle_matching_mode.sql')
  ]);

  assert.match(api, /upsert\(rows,\s*\{[\s\S]*onConflict:\s*'cycle_id,evaluator_id,target_id'[\s\S]*ignoreDuplicates:\s*true/);
  assert.match(api, /action === 'matching_mode_update'/);
  assert.match(ui, /action:\s*'matching_mode_update'/);
  assert.match(ui, /cycle\?\.auto_matching_enabled !== false/);
  assert.match(ui, /일시정지 중 매칭 모드 변경 사유를 5자 이상/);
  assert.match(ui, /matching_mode_update'[\s\S]*reason/);
  assert.match(ui, /cycle\.auto_matching_enabled = response\.data\?\.auto_matching_enabled !== false/);
  assert.match(migration, /add column if not exists auto_matching_enabled boolean not null default true/i);
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
