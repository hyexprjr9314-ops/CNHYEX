import ExcelJS from 'exceljs';

export const REPORT_COLUMNS = Object.freeze([
  ['company', '소속사'], ['name', '이름'], ['department', '부서'], ['workplace', '근무지'], ['role', '직급'],
  ['area1', '평가영역1'], ['area1Score', '영역1점수'], ['area2', '평가영역2'], ['area2Score', '영역2점수'],
  ['area3', '평가영역3'], ['area3Score', '영역3점수'], ['area4', '평가영역4'], ['area4Score', '영역4점수'],
  ['evaluationCount', '평가횟수'], ['rawScore', '원점수'], ['adjustmentStatus', '조정여부'],
  ['finalScore', '최종점수'], ['grade', '평가등급']
]);

const gradeColors = Object.freeze({ EX: 'FF7C3AED', S: 'FF0F766E', A: 'FF2563EB', B: 'FF475569', C: 'FFC2410C', D: 'FFBE123C' });
const border = { top: { style: 'thin', color: { argb: 'FFD5DCE5' } }, left: { style: 'thin', color: { argb: 'FFD5DCE5' } }, bottom: { style: 'thin', color: { argb: 'FFD5DCE5' } }, right: { style: 'thin', color: { argb: 'FFD5DCE5' } } };

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeReportRows(rows = []) {
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('리포트 행 수가 올바르지 않습니다.');
  return rows.map((row, index) => {
    const normalized = {};
    for (const [key] of REPORT_COLUMNS) normalized[key] = row?.[key] ?? '';
    for (const key of ['area1Score','area2Score','area3Score','area4Score','rawScore','finalScore']) normalized[key] = finiteNumber(normalized[key]);
    normalized.evaluationCount = Math.max(0, Math.trunc(finiteNumber(normalized.evaluationCount) ?? 0));
    normalized.grade = String(normalized.grade || '').trim().toUpperCase();
    normalized.adjustmentStatus = normalized.adjustmentStatus === '조정됨' ? '조정됨' : '미조정';
    if (!String(normalized.name).trim()) throw new Error(`${index + 1}번째 행의 이름이 없습니다.`);
    return normalized;
  });
}

export function buildEvaluationReportWorkbook({ cycleName, reportDate, rows }) {
  const data = normalizeReportRows(rows);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '충남한양 인사평가 시스템';
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  const report = workbook.addWorksheet('전체 리포트', {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  });
  report.mergeCells('A1:R1');
  report.getCell('A1').value = `${cycleName || '인사평가'} 전체 리포트`;
  report.getCell('A1').font = { name: '맑은 고딕', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  report.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  report.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  report.getRow(1).height = 34;
  report.mergeCells('A2:R2');
  report.getCell('A2').value = `출력일: ${reportDate || new Date().toISOString().slice(0, 10)}  |  총 ${data.length.toLocaleString('ko-KR')}명`;
  report.getCell('A2').font = { name: '맑은 고딕', size: 10, color: { argb: 'FF475569' } };
  report.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };
  report.getRow(3).height = 8;

  const header = report.getRow(4);
  header.values = REPORT_COLUMNS.map(([, label]) => label);
  header.height = 30;
  header.eachCell(cell => {
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = border;
  });
  report.autoFilter = { from: 'A4', to: 'R4' };

  data.forEach((item, index) => {
    const row = report.addRow(REPORT_COLUMNS.map(([key]) => item[key]));
    row.height = 24;
    row.eachCell((cell, column) => {
      cell.font = { name: '맑은 고딕', size: 9, color: { argb: 'FF172033' } };
      cell.alignment = { vertical: 'middle', horizontal: [7,9,11,13,15,17].includes(column) ? 'right' : 'center' };
      cell.border = border;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? 'FFF8FAFC' : 'FFFFFFFF' } };
    });
    for (const column of [7,9,11,13,15,17]) row.getCell(column).numFmt = '0.0';
    row.getCell(14).numFmt = '0';
    if (item.adjustmentStatus === '조정됨') {
      for (const column of [15,16,17]) row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      row.getCell(16).font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF92400E' } };
    }
    const gradeCell = row.getCell(18);
    const gradeColor = gradeColors[item.grade] || 'FF64748B';
    gradeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gradeColor } };
    gradeCell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  });

  const widths = [15,12,14,11,11,16,11,16,11,16,11,18,11,10,11,11,11,10];
  widths.forEach((width, index) => { report.getColumn(index + 1).width = width; });
  report.headerFooter.oddFooter = '&L충남한양 인사평가 시스템&C대외비&R&P / &N';
  report.getColumn(2).alignment = { vertical: 'middle', horizontal: 'left' };

  const summary = workbook.addWorksheet('평가 요약', { views: [{ state: 'frozen', ySplit: 4 }] });
  summary.mergeCells('A1:H1');
  summary.getCell('A1').value = `${cycleName || '인사평가'} 요약`;
  summary.getCell('A1').font = { name: '맑은 고딕', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  summary.getRow(1).height = 34;
  summary.addRow([]);
  summary.addRow(['핵심 지표', '값', '', '', '평가등급', '인원', '비율']);
  const count = data.length;
  const rawAverage = count ? data.reduce((sum, row) => sum + (row.rawScore || 0), 0) / count : 0;
  const finalAverage = count ? data.reduce((sum, row) => sum + (row.finalScore || 0), 0) / count : 0;
  const adjusted = data.filter(row => row.adjustmentStatus === '조정됨').length;
  const metrics = [['총 평가인원', count], ['평균 원점수', rawAverage], ['평균 최종점수', finalAverage], ['조정 인원', adjusted], ['미조정 인원', count - adjusted]];
  metrics.forEach((metric, index) => {
    summary.getCell(4 + index, 1).value = metric[0]; summary.getCell(4 + index, 2).value = metric[1];
    summary.getCell(4 + index, 1).font = { name: '맑은 고딕', bold: true, color: { argb: 'FF334155' } };
    summary.getCell(4 + index, 2).font = { name: '맑은 고딕', bold: true, color: { argb: 'FF0F766E' } };
    summary.getCell(4 + index, 2).numFmt = index === 0 || index > 2 ? '0' : '0.0';
  });
  ['EX','S','A','B','C','D'].forEach((grade, index) => {
    const row = 4 + index; const gradeCount = data.filter(item => item.grade === grade).length;
    summary.getCell(row, 5).value = grade; summary.getCell(row, 6).value = gradeCount; summary.getCell(row, 7).value = count ? gradeCount / count : 0;
    summary.getCell(row, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gradeColors[grade] } };
    summary.getCell(row, 5).font = { name: '맑은 고딕', bold: true, color: { argb: 'FFFFFFFF' } };
    summary.getCell(row, 7).numFmt = '0.0%';
  });
  for (const row of summary.getRows(3, 7) || []) row.eachCell(cell => { cell.border = border; cell.alignment = { vertical: 'middle', horizontal: 'center' }; });
  summary.getRow(3).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; cell.font = { name: '맑은 고딕', bold: true, color: { argb: 'FFFFFFFF' } }; });
  summary.columns = [{ width: 20 }, { width: 14 }, { width: 4 }, { width: 4 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 4 }];
  summary.headerFooter.oddFooter = '&L충남한양 인사평가 시스템&C대외비&R&P / &N';
  return workbook;
}
