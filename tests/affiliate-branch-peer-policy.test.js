import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL('../supabase/migrations/202608080002_affiliate_branch_peer_policy.sql', import.meta.url);
const api = new URL('../api/admin-state.js', import.meta.url);
const index = new URL('../index.html', import.meta.url);

test('affiliate branch peers reuse headquarters questions and scoring categories', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /p_track in \('headquarters_member', 'branch_employee'\)/);
  assert.match(sql, /question_audience = 'affiliate_peer'[\s\S]*?canonical_question_track_alias\(question\.target_track\) in \('all', 'headquarters_member'\)/);
  assert.match(sql, /v_question_audience = 'affiliate_peer'[\s\S]*?array\['성과','협업','성장','조화'\]/);
  assert.match(sql, /coalesce\(evaluator\.company::text, ''\)/);
});

test('manual matching UI and API enforce the branch affiliate-only rule', async () => {
  const [apiSource, indexSource] = await Promise.all([readFile(api, 'utf8'), readFile(index, 'utf8')]);
  assert.match(apiSource, /allowedMatchingPair/);
  assert.match(apiSource, /영업소 팀원급은 다른 계열사의 팀원급과만 매칭할 수 있습니다/);
  assert.match(indexSource, /allowedInteractiveMatchingPair\(evaluator, target\)/);
  assert.match(indexSource, /questionAudience === 'affiliate_peer'[\s\S]*?questionTrack === 'headquarters_member'/);
});
