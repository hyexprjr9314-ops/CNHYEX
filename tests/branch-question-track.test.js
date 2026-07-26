import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('branch question routing is enabled consistently in DB preflight', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202607260002_enable_branch_question_track.sql', import.meta.url), 'utf8');
  const profile = sql.match(/create or replace function public\.canonical_question_track_for_profile[\s\S]*?\$\$;/i)?.[0] ?? '';
  const coverage = sql.match(/create or replace function public\.validate_cycle_question_coverage[\s\S]*?\$\$;/i)?.[0] ?? '';

  assert.ok(profile.indexOf("'정비사'") < profile.indexOf("'%영업소%'"));
  assert.ok(profile.indexOf("'팀장/부서장급'") < profile.indexOf("'%영업소%'"));
  assert.match(profile, /then 'branch_employee'/);
  assert.match(sql, /when 'branch_employee' then 'branch_employee'/);
  for (const category of ['비상대응', '소통 협력', '솔선 수범', '갈등 해소']) {
    assert.match(coverage, new RegExp(category));
  }
  assert.doesNotMatch(coverage, /relationship_type|question\.audience|question\.target_dept/);
});
