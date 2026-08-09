import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('evaluation comments require ten characters in both browser and database', async () => {
  const [index, migration] = await Promise.all([
    read('../index.html'),
    read('../supabase/migrations/202608090002_reduce_evaluation_comment_minimum.sql')
  ]);
  assert.match(index, /text\.length < 10/);
  assert.match(index, /10자 이상/);
  assert.doesNotMatch(index, /50자 이상|text\.length < 50/);
  assert.match(migration, /p_comment[\s\S]*< 10/);
  assert.match(migration, /at least 10 characters/);
});
