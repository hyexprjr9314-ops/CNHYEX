import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240004_question_scope_and_dynamic_scoring.sql', import.meta.url);

test('dynamic scoring has an explicit legacy-category compatibility path', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /v_has_track_categories boolean/);
  assert.match(migration, /v_has_legacy_categories boolean/);
  assert.match(migration, /if not v_has_track_categories then/);
  assert.match(migration, /v_categories := v_legacy_categories/);
  assert.match(migration, /All four track-specific categories, or all four legacy categories/);
});
