import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('mechanic repair removes only unsubmitted draft affiliate pairs and fixes legacy profiles', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202608080004_reclassify_mechanics_and_remove_affiliate_draft_pairs.sql', import.meta.url), 'utf8');
  assert.match(sql, /cycle\.status::text in \('초안', 'draft', 'not_started'\)/);
  assert.match(sql, /not exists \(select 1 from public\.evaluations/);
  assert.match(sql, /trim\(evaluator\.company::text\) <> trim\(target\.company::text\)/);
  assert.match(sql, /type::text = '팀원급'[\s\S]*coalesce\(role, ''\) like '%정비%'/);
  assert.match(sql, /update public\.users[\s\S]*set type = '정비사'/);
  assert.doesNotMatch(sql, /delete from public\.evaluations/);
});

test('mechanic assignment repair rejects every unsupported one-sided draft pairing', async () => {
  const migrations = await Promise.all([
    '../supabase/migrations/202608080005_remove_invalid_mechanic_draft_pairs.sql',
    '../supabase/migrations/202608080006_reapply_strict_mechanic_draft_gate.sql',
    '../supabase/migrations/202608080007_require_both_branch_profiles_for_mechanic_exception.sql'
  ].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const sql of migrations) {
    assert.match(sql, /evaluator\.is_mechanic or target\.is_mechanic/);
    assert.match(sql, /and not case[\s\S]*when evaluator\.is_mechanic and target\.is_mechanic[\s\S]*when evaluator\.is_branch and target\.is_branch[\s\S]*when evaluator\.is_vehicle_safety and target\.is_mechanic[\s\S]*when evaluator\.is_mechanic or target\.is_mechanic then false/);
    assert.match(sql, /nullif\(replace\(regexp_replace\(coalesce\(workplace, ''\)/);
    assert.match(sql, /evaluator\.branch_key = target\.branch_key/);
    assert.match(sql, /not exists \([\s\S]*public\.evaluations/);
    assert.doesNotMatch(sql, /delete from public\.evaluations/);
  }
});
