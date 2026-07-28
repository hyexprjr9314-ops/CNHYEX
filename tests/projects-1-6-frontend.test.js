import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readIndex = () => readFile(new URL('../index.html', import.meta.url), 'utf8');

test('executives can open the read-only progress dashboard', async () => {
  const index = await readIndex();
  assert.match(index, /\['summary', 'history', 'progress'\]\.includes\(subtab\)/);
  assert.match(index, /isExecOnly && st !== 'progress'/);
  assert.match(index, /closingmanage: roleInfo\.isPrivileged/);
  assert.match(index, /evalmanage: roleInfo\.isAdmin/);
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

test('mobile regular-user flow uses swipe decks without changing evaluation actions', async () => {
  const index = await readIndex();
  assert.match(index, /\.relationship-card-deck[\s\S]*position: relative/);
  assert.match(index, /\.relationship-target-card[\s\S]*touch-action: pan-y/);
  assert.match(index, /stableCardHeight[\s\S]*deck\.style\.maxHeight/);
  assert.match(index, /#mobile-target-welcome-hero,[\s\S]*#view-list #directory-toolbar-targets[\s\S]*display: none/);
  assert.match(index, /button\[onclick\^="downloadCSV"\],[\s\S]*#bulk-grade-mail-btn[\s\S]*display: none/);
  assert.match(index, /#my-report-cycle-select,[\s\S]*#progress-cycle-select[\s\S]*max-width: 15rem/);
  assert.match(index, /#summary-cycle-select,[\s\S]*#summary-cycle-select-label[\s\S]*display: none !important/);
  assert.match(index, /#history-archive-heading[\s\S]*flex-direction: column/);
  assert.match(index, /\.history-cycle-primary[\s\S]*flex-basis: 100%/);
  assert.match(index, /function initializeMobileTargetDeck\(deck\)/);
  assert.match(index, /card\.addEventListener\('pointerdown'/);
  assert.match(index, /card\.addEventListener\('pointermove'/);
  assert.match(index, /Math\.abs\(deltaX\) >= deck\.clientWidth \* 0\.24 \|\| velocity >= 0\.55/);
  assert.match(index, /deck\.appendChild\(card\)/);
  assert.match(index, /initializeMobileTargetDeck\(groupGrid\)/);
  assert.match(index, /#statutory-questions-container \{[\s\S]*display: block;[\s\S]*overflow: visible/);
  assert.match(index, /#statutory-questions-container > \.mobile-question-card \{[\s\S]*width: 100%/);
  assert.doesNotMatch(index, /#statutory-questions-container[\s\S]{0,300}scroll-snap-type: x mandatory/);
  assert.match(index, /card\.onclick = \(\) => openEvaluationForm\(emp, false\)/);
  assert.match(index, /onclick="openPreviewModal\(\)"/);
  assert.match(index, /\.relationship-target-card \{[\s\S]*min-height: 190px/);
  assert.match(index, /<span>평가 시작<\/span>/);
  assert.doesNotMatch(index, /평가권한 활성화/);
  assert.doesNotMatch(index, /\$\{myCurrentStageText\}/);
});

test('published results require one dinosaur egg reveal per user and cycle on desktop and mobile', async () => {
  const index = await readIndex();
  assert.match(index, /id="mobile-result-hatch"[\s\S]*onclick="hatchMobileResult\(\)"/);
  assert.match(index, /function prepareMobileResultHatch\(grade\)/);
  assert.match(index, /function hatchMobileResult\(\)/);
  assert.match(index, /result-hatch-active/);
  assert.match(index, /\.grade-result-card\.result-hatch-active \{[\s\S]*background: #F8FAFC !important/);
  assert.match(index, /\.grade-result-card\.result-hatch-active::before,[\s\S]*display: none !important/);
  assert.match(index, /gradeCard\.appendChild\(hatch\)/);
  assert.match(index, /const shouldShow = hasGrade && !alreadyHatched/);
  assert.doesNotMatch(index, /const shouldShow = isMobile && hasGrade/);
  assert.match(index, /sessionStorage\.setItem\(mobileResultHatchKey\(\), '1'\)/);
  assert.match(index, /@keyframes dinosaur-egg-wobble/);
  assert.match(index, /@keyframes dinosaur-egg-crack/);
  assert.match(index, /@keyframes dinosaur-crack-light/);
  assert.match(index, /@keyframes dinosaur-light-rays/);
  assert.match(index, /reducedMotion \? 20 : 2950/);
});

test('target hero omits the redundant self-evaluation note without changing exclusion copy elsewhere', async () => {
  const index = await readIndex();
  assert.match(index, /배정된 동료들에 대한 360° 다면평가를 성실히 진행해 주세요\.'/);
  assert.doesNotMatch(index, /성실히 진행해 주세요\. \(자기평가 제외됨\)/);
  assert.match(index, /동료평가 전용 문항/);
  assert.doesNotMatch(index, /동료평가 전용 \(자기평가 제외\)/);
  assert.doesNotMatch(index, /동료평가 전용 문항 \(자기평가 제외됨\)/);
  assert.doesNotMatch(index, /5지선다 문항 기반 자동 점수 환산/);
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
  assert.match(index, /runEmergencyCycleAction\(\$\{c\.id\}, 'cycle_hard_delete'\)/);
  assert.match(index, /confirmation/);
  assert.match(index, /status: cycle\.status/);
  assert.doesNotMatch(index, /status: cycle\.status === '진행중' \? '진행 중'/);
  assert.match(index, /확인을 위해/);
});
