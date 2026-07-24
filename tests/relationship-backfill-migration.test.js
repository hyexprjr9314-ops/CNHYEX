import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240005_backfill_matching_relationship_types.sql', import.meta.url);

test('relationship backfill uses the same leader precedence and enum-safe type casts', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /coalesce\(evaluator\.type::text, ''\)/);
  assert.match(migration, /coalesce\(target\.type::text, ''\)/);
  assert.match(migration, /and context\.evaluator_dept <> context\.target_dept then 'exchange'/);
  assert.match(migration, /when context\.target_is_leader then 'leadership'/);
  assert.match(migration, /else 'internal'/);
});
