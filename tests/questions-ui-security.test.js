import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexUrl = new URL('../index.html', import.meta.url);

test('database-backed management, history, and question text is HTML-escaped', async () => {
  const index = await readFile(indexUrl, 'utf8');
  for (const token of [
    '${escapeHtml(s.name)}', '${escapeHtml(s.company)}', '${escapeHtml(archive.cycleName)}',
    '${escapeHtml(u.name)}', '${escapeHtml(u.email)}', '${escapeHtml(q.text)}',
    '${escapeHtml(targetTrackLabel)}', 'escapeHtml(targetDept === \'전체\' ? \'전체 부서 공통\' : targetDept)', '${escapeHtml(error.message)}'
  ]) assert.ok(index.includes(token), `missing escape contract: ${token}`);
});

test('CSV report prefers immutable finalized results and emits actual category labels', async () => {
  const index = await readFile(indexUrl, 'utf8');
  assert.match(index, /finalResultsByCycle/);
  assert.match(index, /const finalized = finalResultsByCycle\[currentSelectedSummaryCycleId\] \|\| \{\}/);
  assert.match(index, /finalResult\?\.effective_score \?\? score\.final/);
  assert.match(index, /finalResult\?\.relative_grade \|\| score\.grade/);
  assert.match(index, /finalResult\?\.category_scores && typeof finalResult\.category_scores === 'object'/);
  assert.match(index, /\['performance', 'collaboration', 'growth', 'harmony'\]/);
  assert.match(index, /categoryLabels\[0\]/);
  assert.match(index, /평가영역1,영역1점수/);
});
