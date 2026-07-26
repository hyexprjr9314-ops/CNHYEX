import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildGradeBasis, hasUnresolvedActiveAdjustment, isFinalResultAdjusted, secondStageFinalScore } from '../api/result-state.js';

const resultStateUrl = new URL('../api/result-state.js', import.meta.url);

test('approval readiness ignores cancelled adjustments and accepts final adjustments', () => {
  assert.equal(hasUnresolvedActiveAdjustment([]), false);
  assert.equal(hasUnresolvedActiveAdjustment([{ status: 'active', workflow_status: 'second_stage_adjusted' }]), false);
  assert.equal(hasUnresolvedActiveAdjustment([{ status: 'active', workflow_status: 'first_stage_adjusted' }]), true);
  assert.equal(hasUnresolvedActiveAdjustment([{ status: 'cancelled', workflow_status: 'first_stage_adjusted' }]), false);
});

test('stage 2 accepts an explicit valid score or retains the first-stage score', () => {
  assert.equal(secondStageFinalScore(undefined, 83.5), 83.5);
  assert.equal(secondStageFinalScore('', 83.5), 83.5);
  assert.equal(secondStageFinalScore(91.2, 83.5), 91.2);
  assert.equal(secondStageFinalScore(-1, 83.5), null);
  assert.equal(secondStageFinalScore(101, 83.5), null);
});

test('result mutations are delegated only to atomic governance RPCs', async () => {
  const source = await readFile(resultStateUrl, 'utf8');
  for (const rpc of ['governance_adjust_final_score', 'governance_cancel_adjustment', 'governance_request_approval', 'governance_decide_approval', 'governance_publish_results']) {
    assert.match(source, new RegExp(rpc));
  }
  assert.doesNotMatch(source, /governance_stage1_adjust|governance_stage2_adjust/);
  assert.doesNotMatch(source, /evaluation_cycle_approval_requests'\)\.insert/);
  assert.doesNotMatch(source, /evaluation_result_adjustments'\)\.upsert/);
});

test('governance RPCs preserve the verified user JWT context', async () => {
  const source = await readFile(resultStateUrl, 'utf8');
  assert.match(source, /function authenticatedRpcClient\(accessToken\)/);
  assert.match(source, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(source, /authenticatedRpcClient\(accessToken\)\s*\.rpc\(rpcName/);
  assert.doesNotMatch(source, /service\.rpc\(rpcName/);
});

test('closed personal results are read from the current immutable final-result version', async () => {
  const source = await readFile(resultStateUrl, 'utf8');
  assert.match(source, /from\('evaluation_final_results'\)/);
  assert.match(source, /eq\('result_version', cycle\.data\.result_version\)/);
  assert.match(source, /category_scores/);
});

test('finalized score or approved-grade changes keep personal category graphs private', () => {
  assert.equal(isFinalResultAdjusted({ raw_score: 80, effective_score: 80, relative_grade: 'B', approved_grade: null }), false);
  assert.equal(isFinalResultAdjusted({ raw_score: 80, effective_score: 85, relative_grade: 'B', approved_grade: 'B' }), true);
  assert.equal(isFinalResultAdjusted({ raw_score: 80, effective_score: 80, relative_grade: 'B', approved_grade: 'A' }), true);
});

test('grade basis explains relative, EX, and approved override results without exposing exact rank', () => {
  const rows = [
    { target_id: 1, cohort_key: 'headquarters', raw_score: 95, effective_score: 95, relative_grade: 'S' },
    { target_id: 2, cohort_key: 'headquarters', raw_score: 90, effective_score: 90, relative_grade: 'A' },
    { target_id: 3, cohort_key: 'headquarters', raw_score: 80, effective_score: 80, relative_grade: 'B' },
    { target_id: 4, cohort_key: 'headquarters', raw_score: 100, effective_score: 100, relative_grade: 'EX' }
  ];
  const relative = buildGradeBasis(rows[1], rows);
  assert.equal(relative.top_percent, 67);
  assert.match(relative.text, /본사 집계구역 상대평가에서 상위 67% 구간/);
  assert.doesNotMatch(relative.text, /2위/);

  const exceptional = buildGradeBasis(rows[3], rows);
  assert.equal(exceptional.type, 'exceptional');
  assert.match(exceptional.text, /100점/);

  const overridden = buildGradeBasis({ ...rows[2], approved_grade: 'A' }, rows);
  assert.equal(overridden.type, 'approved_override');
  assert.match(overridden.text, /산정등급 B에서.*A등급/);
});

test('personal result UI passes the released grade into the score renderer', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const renderer = html.match(/function renderMyResults\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(renderer, /const descriptionEl = document\.getElementById\('my-grade-description'\)/);
  assert.ok(renderer.indexOf('const descriptionEl') < renderer.indexOf('if (descriptionEl)'));
  assert.ok(renderer.indexOf('if (descriptionEl)') < renderer.indexOf('loadServerResultState(parseInt(selectedVal))'));
  assert.match(html, /applyPublishedScores\(\{ \.\.\.payload\.scores, relative_grade: payload\.relative_grade \}, payload\.grade_basis\)/);
  assert.match(html, /applyAdjustedResultMode\(payload\.relative_grade \|\| payload\.adjustment\?\.grade_override[\s\S]+payload\.grade_basis\)/);
});
