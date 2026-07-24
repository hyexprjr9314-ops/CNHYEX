import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { hasUnresolvedActiveAdjustment, secondStageFinalScore } from './result-state.js';

const resultStateUrl = new URL('./result-state.js', import.meta.url);

test('approval readiness ignores cancelled adjustments and requires stage 2 for active adjustments', () => {
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
  for (const rpc of ['governance_stage1_adjust', 'governance_stage2_adjust', 'governance_cancel_adjustment', 'governance_request_approval', 'governance_decide_approval', 'governance_publish_results']) {
    assert.match(source, new RegExp(rpc));
  }
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
