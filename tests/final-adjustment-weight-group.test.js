import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('final adjustment groups the track-specific settings used beside score averages', async () => {
  const source = await readFile(
    new URL('../supabase/migrations/202607250008_unified_final_adjustment.sql', import.meta.url),
    'utf8'
  );

  assert.match(source, /group by s\.track_category_weights, s\.performance_weight, s\.collaboration_weight,\s+s\.growth_weight, s\.harmony_weight/);
});
