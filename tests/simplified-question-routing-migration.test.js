import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607250007_simplify_question_routing.sql', import.meta.url);

test('question routing depends on the target employee type, not department or relationship', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const track = sql.match(/create or replace function public\.canonical_question_track_for_profile[\s\S]*?\$\$;/i)?.[0] ?? '';
  const assigned = sql.match(/create or replace function public\.my_assigned_questions[\s\S]*?\$\$;/i)?.[0] ?? '';
  const coverage = sql.match(/create or replace function public\.validate_cycle_question_coverage[\s\S]*?\$\$;/i)?.[0] ?? '';

  assert.match(track, /p_employee_type/);
  assert.doesNotMatch(track, /p_role.*~|p_dept.*like|p_workplace.*like/i);
  assert.doesNotMatch(assigned, /q\.audience|q\.target_dept/);
  assert.doesNotMatch(coverage, /q\.audience|q\.target_dept|relationship_type/);
});

test('paused question edits are allowed only before any evaluation submission', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /tg_table_name = 'evaluation_questions'[\s\S]*v_status = '일시정지'/);
  assert.match(sql, /not exists \([\s\S]*from public\.evaluations[\s\S]*cycle_id = v_cycle_id/i);
  assert.match(sql, /array\[old\.cycle_id, new\.cycle_id\]/);
  assert.match(sql, /foreach v_cycle_id in array v_cycle_ids loop/);
});
