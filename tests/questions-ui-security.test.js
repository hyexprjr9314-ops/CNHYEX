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
  for (const unsafe of [
    '>${q.category}</span>', '>${u.company}</span>', '${u.dept} • ${u.workplace}',
    '${u.company} • ${u.dept}'
  ]) assert.equal(index.includes(unsafe), false, `unsafe HTML interpolation remains: ${unsafe}`);
});

test('report exports prefer immutable finalized results and emit actual category labels', async () => {
  const index = await readFile(indexUrl, 'utf8');
  assert.match(index, /finalResultsByCycle/);
  assert.match(index, /const finalized = finalResultsByCycle\[currentSelectedSummaryCycleId\] \|\| \{\}/);
  assert.match(index, /finalResult\?\.effective_score \?\? score\.final/);
  assert.match(index, /finalResult\?\.relative_grade \|\| score\.grade/);
  assert.match(index, /finalResult\?\.category_scores && typeof finalResult\.category_scores === 'object'/);
  assert.match(index, /\['performance', 'collaboration', 'growth', 'harmony'\]/);
  assert.match(index, /categoryLabels\[0\]/);
  assert.match(index, /'평가영역1',\s*'영역1점수'/);
  assert.match(index, /buildEvaluationReportRows/);
});
