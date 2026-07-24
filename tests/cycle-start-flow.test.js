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
  assert.match(migration, /add column if not exists auto_matching_enabled boolean not null default true/i);
});

test('cycle validation groups repeated question gaps into actionable scopes', async () => {
  const ui = await read('../index.html');
  assert.match(ui, /formatCycleValidationReportGrouped/);
  assert.match(ui, /issue\.target_track/);
  assert.match(ui, /issue\.relationship_type/);
  assert.match(ui, /issue\.category/);
});
