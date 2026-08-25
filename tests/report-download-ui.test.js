import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('report download exposes Excel first and CSV fallback', () => {
  assert.match(html, /onclick="downloadExcelReport\(this\)"/);
  assert.match(html, />전체 리포트 Excel</);
  assert.match(html, /onclick="downloadCSVReport\(\)"/);
  assert.match(html, />CSV 원본</);
  assert.match(html, /Excel 리포트 생성에 실패했습니다[\s\S]*CSV 원본으로 다운로드/);
});

test('shared report rows include company and requested export order', () => {
  assert.match(html, /company: user\.company \|\| ''/);
  assert.match(html, /\['소속사','이름','부서','근무지','직급','평가영역1','영역1점수'/);
  assert.match(html, /const csvRows = buildEvaluationReportRows\(\)/);
});
