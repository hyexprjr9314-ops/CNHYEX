import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluationReportWorkbook, normalizeReportRows, REPORT_COLUMNS } from '../lib/evaluation-report-workbook.js';

const sample = {
  company: '(주)충남고속', name: '테스트직원', department: '안전', workplace: '본사', role: '대리',
  area1: '성과', area1Score: 91.4, area2: '협업', area2Score: 88.6,
  area3: '성장', area3Score: 90.1, area4: '조화', area4Score: 89.5,
  evaluationCount: 7, rawScore: 90.3, adjustmentStatus: '조정됨', finalScore: 92.0, grade: 'A'
};

test('report rows preserve the requested column order and numeric values', () => {
  const rows = normalizeReportRows([sample]);
  assert.deepEqual(REPORT_COLUMNS.map(([, label]) => label), [
    '소속사','이름','부서','근무지','직급','평가영역1','영역1점수','평가영역2','영역2점수',
    '평가영역3','영역3점수','평가영역4','영역4점수','평가횟수','원점수','조정여부','최종점수','평가등급'
  ]);
  assert.equal(rows[0].rawScore, 90.3);
  assert.equal(rows[0].evaluationCount, 7);
});

test('xlsx workbook contains styled report and summary sheets', async () => {
  const workbook = buildEvaluationReportWorkbook({ cycleName: '2026년 상반기 인사평가', reportDate: '2026-08-25', rows: [sample] });
  const report = workbook.getWorksheet('전체 리포트');
  const summary = workbook.getWorksheet('평가 요약');
  assert.equal(report.getCell('A4').value, '소속사');
  assert.equal(report.getCell('R4').value, '평가등급');
  assert.equal(report.getCell('A5').value, '(주)충남고속');
  assert.equal(report.getCell('Q5').value, 92);
  assert.equal(report.views[0].xSplit, 5);
  assert.equal(summary.getCell('A4').value, '총 평가인원');
  assert.equal(summary.getCell('B4').value, 1);
  const bytes = await workbook.xlsx.writeBuffer();
  assert.ok(bytes.byteLength > 5000);
});
