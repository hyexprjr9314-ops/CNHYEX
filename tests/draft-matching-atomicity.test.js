import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('draft matching replacement is a guarded, single RPC transaction', async () => {
  const sql = await read('../supabase/migrations/202607250005_draft_matching_replace_rpc.sql');
  assert.match(sql, /create or replace function public\.governance_replace_draft_matchings/i);
  assert.match(sql, /v_cycle\.status::text <> '초안'/i);
  assert.match(sql, /v_cycle\.internal_approval_status <> 'not_requested'/i);
  assert.doesNotMatch(sql, /'closed'|'cancelled'|'archived'/i);
  assert.match(sql, /delete from public\.matchings[\s\S]*insert into public\.matchings/i);
  assert.match(sql, /update public\.matchings m[\s\S]*relationship_type = x\.relationship_type/i);
  assert.match(sql, /grant execute on function public\.governance_replace_draft_matchings\(bigint, bigint, jsonb, uuid\) to authenticated/i);
});

test('matching_replace routes draft writes through the atomic RPC', async () => {
  const api = await read('../api/admin-state.js');
  const branch = api.match(/action === 'matching_replace'[\s\S]*?action === 'matching_mode_update'/)?.[0] ?? '';
  assert.match(branch, /governance_replace_draft_matchings/);
  assert.doesNotMatch(branch, /service\.from\('matchings'\)\.delete\(\)\.in\('id', removable\)/);
  assert.doesNotMatch(branch, /service\.from\('matchings'\)\.upsert\(rows/);
});
