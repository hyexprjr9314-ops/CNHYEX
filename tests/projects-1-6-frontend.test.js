import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readIndex = () => readFile(new URL('../index.html', import.meta.url), 'utf8');

test('executives can open the read-only progress dashboard', async () => {
  const index = await readIndex();
  assert.match(index, /\['summary', 'history', 'progress'\]\.includes\(subtab\)/);
  assert.match(index, /isExecOnly && st !== 'progress'/);
  assert.match(index, /if \(!roleInfo\.isAdmin && !roleInfo\.isExecutive\) return/);
});

test('mobile UI keeps role-filtered navigation fluid and progress tables readable', async () => {
  const index = await readIndex();
  assert.match(index, /grid-auto-columns: minmax\(0, 1fr\)/);
  assert.match(index, /\.mobile-card-table td::before/);
  assert.match(index, /function applyMobileAdminTableLayout\(\)/);
  assert.match(index, /'#admin-subtab-summary table'/);
  assert.match(index, /data-label="미제출 대상"/);
  assert.match(index, /\.evaluation-score-option \{/);
});

test('target hero omits the redundant self-evaluation note without changing exclusion copy elsewhere', async () => {
  const index = await readIndex();
  assert.match(index, /배정된 동료들에 대한 360° 다면평가를 성실히 진행해 주세요\.'/);
  assert.doesNotMatch(index, /성실히 진행해 주세요\. \(자기평가 제외됨\)/);
  assert.match(index, /동료평가 전용 문항 \(자기평가 제외됨\)/);
});

test('CSV user import supports native single-file drag and drop through the existing parser', async () => {
  const index = await readIndex();
  assert.match(index, /id="csv-user-dropzone"/);
  assert.match(index, /ondrop="handleCSVDrop\(event\)"/);
  assert.match(index, /function processCSVFile\(file\)/);
  assert.match(index, /CSV 파일 한 개만 드롭해 주세요/);
  assert.match(index, /const rows = parseCSV\(e\.target\.result\)/);
});

test('cycle cards expose bounded pause and super-admin emergency actions', async () => {
  const index = await readIndex();
  for (const action of ['cycle_pause', 'cycle_resume', 'cycle_force_close', 'cycle_cancel']) {
    assert.match(index, new RegExp(action));
  }
  assert.match(index, /isAdmin && String\(user\.email \|\| ''\)\.toLowerCase\(\) === 'admin@cnhyex\.com'/);
  assert.match(index, /runEmergencyCycleAction\(\$\{c\.id\}, 'cycle_cancel', true\)/);
  assert.match(index, /hard_delete: hardDelete/);
  assert.match(index, /status: cycle\.status/);
  assert.doesNotMatch(index, /status: cycle\.status === '진행중' \? '진행 중'/);
  assert.match(index, /확인을 위해/);
});
