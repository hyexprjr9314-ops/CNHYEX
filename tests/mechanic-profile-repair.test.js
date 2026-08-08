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
