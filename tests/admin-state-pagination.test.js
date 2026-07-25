import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from '../api/admin-state.js';

test('fetchAllRows reads beyond the Supabase 1000-row response limit', async () => {
  const source = Array.from({ length: 2002 }, (_, id) => ({ id: id + 1 }));
  const buildQuery = () => ({
    range: async (from, to) => ({ data: source.slice(from, to + 1), error: null })
  });

  const result = await fetchAllRows(buildQuery);

  assert.equal(result.error, null);
  assert.equal(result.data.length, 2002);
  assert.equal(result.data.at(-1).id, 2002);
});
