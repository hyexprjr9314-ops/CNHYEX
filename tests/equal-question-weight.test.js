import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('question weight is server-owned and hidden from all management inputs', async () => {
  const [index, adminState, questions, migration] = await Promise.all([
    read('../index.html'),
    read('../api/admin-state.js'),
    read('../api/questions.js'),
    read('../supabase/migrations/202607260003_equal_question_weights.sql')
  ]);

  assert.doesNotMatch(index, /q-weight-in|edit-q-weight|가중치 반영|질문유형,가중치\(%\)/);
  assert.doesNotMatch(index, /가중치 \$\{q\.weight\}%/);
  assert.match(index, /성과,영업소 직원,5지선다형/);
  assert.match(adminState, /weight: 1/);
  assert.match(questions, /weight: 1/);
  assert.match(migration, /new\.weight := 1/);
  assert.match(migration, /alter column weight set default 1/);
});
