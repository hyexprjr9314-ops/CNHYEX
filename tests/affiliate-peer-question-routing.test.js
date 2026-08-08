import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608080001_affiliate_peer_question_routing.sql', import.meta.url);

test('database routes only cross-company team-member pairs to affiliate questions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const assigned = sql.match(/create or replace function public\.my_assigned_questions[\s\S]*?\$\$;/i)?.[0] ?? '';
  const coverage = sql.match(/create or replace function public\.validate_cycle_question_coverage[\s\S]*?\$\$;/i)?.[0] ?? '';

  for (const source of [assigned, coverage]) {
    assert.match(source, /evaluator\.type::text[\s\S]*?= '팀원급'/);
    assert.match(source, /target\.type::text[\s\S]*?= '팀원급'/);
    assert.match(source, /trim\(evaluator\.company::text\) <> trim\(target\.company::text\)/);
    assert.match(source, /then 'affiliate_peer'[\s\S]*?else 'all'/);
  }
  assert.match(assigned, /coalesce\(question\.audience, 'all'\) = assignment\.question_audience/);
  assert.match(coverage, /coalesce\(question\.audience, 'all'\) = required\.question_audience/);
});
