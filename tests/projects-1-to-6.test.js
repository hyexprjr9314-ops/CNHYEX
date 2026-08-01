import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeResetEmail } from '../api/mail.js';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const resetApi = fs.readFileSync(new URL('../api/mail.js', import.meta.url), 'utf8');

test('public password setup request is generic, throttled, and account-safe', () => {
  assert.equal(normalizeResetEmail('  USER@Example.COM '), 'user@example.com');
  assert.match(resetApi, /GENERIC_MESSAGE/);
  assert.match(resetApi, />= 3/);
  assert.match(resetApi, />= 10/);
  assert.match(resetApi, /active === true && Boolean\(profile\.data\.auth_user_id\)/);
  assert.doesNotMatch(resetApi, /profile\.data\?\.email/);
});

test('login exposes self-service password setup without revealing registration status', () => {
  assert.match(index, /id="password-reset-request-form"/);
  assert.match(index, /requestPasswordSetupEmail/);
});

test('summary uses selected-cycle targets and the expanded filter set', () => {
  assert.match(index, /emp\.is_evaluatee === true && cycleTargetIds\.has/);
  for (const key of ['workplace', 'role', 'type', 'grade', 'status', 'adjusted']) {
    assert.match(index, new RegExp(`id="summary-filter-${key}"`));
  }
});

test('management cycle selection is shared while personal result history remains separate', () => {
  assert.match(index, /id="management-cycle-select"/);
  assert.match(index, /function handleManagementCycleChange/);
  assert.match(index, /function isVisiblePublishedResultCycle/);
  assert.match(index, /hasClosedArchiveForCycle/);
  assert.match(index, /hasCurrentFinalResultForCycle/);
});

test('guide entry points are removed and result card has accessible motion', () => {
  assert.doesNotMatch(index, /id="nav-tab-guide"/);
  assert.doesNotMatch(index, /관리자·임원 전용 가이드라인/);
  assert.match(index, /hourglass-turn/);
  assert.match(index, /prefers-reduced-motion/);
  assert.match(index, /function renderGradeResultCard/);
});

test('database grading policy accepts EX and preserves minimum cohort edges', () => {
  const migration = fs.readFileSync(new URL(
    '../supabase/migrations/202607260006_ex_grade_and_cohort_minimums.sql',
    import.meta.url
  ), 'utf8');

  assert.match(migration, /relative_grade in \('EX','S','A','B','C','D'\)/);
  assert.match(migration, /r\.raw_score = 100 and r\.effective_score = 100/);
  assert.match(migration, /member_count>=10 and grade in \('S','D'\)/);
  assert.match(migration, /evaluation_cycle_exceptional_grade_trigger/);
});

test('completed EX results render an EX badge in the score summary', () => {
  assert.match(index, /if \(g === 'EX'\)/);
  assert.match(index, /EX · ANOTHER LEVEL/);
  assert.match(index, /@keyframes ex-aura/);
  assert.match(index, /@keyframes ex-prism/);
  assert.match(index, /@keyframes ex-shine/);
  assert.match(index, /@keyframes ex-wing-float/);
  assert.match(index, /class="ex-wing-motion text-sm"/);
});
