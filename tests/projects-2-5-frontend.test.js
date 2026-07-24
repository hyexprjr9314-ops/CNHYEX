import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readIndex = () => readFile(new URL('../index.html', import.meta.url), 'utf8');

test('bulk action buttons keep white labels and icons in the white theme', async () => {
  const index = await readIndex();
  for (const id of ['bulk-permission-evaluator-btn', 'bulk-permission-both-btn', 'bulk-password-mail-btn']) {
    assert.match(index, new RegExp(`#${id}[\\s\\S]*color: #FFFFFF !important`));
    assert.match(index, new RegExp(`id="${id}"`));
  }
});

test('internal approval UI collects an ordered executive line and supports recall', async () => {
  const index = await readIndex();
  assert.match(index, /id="modal-approval-line"/);
  assert.match(index, /id="approval-step-one"/);
  assert.match(index, /id="approval-step-two"/);
  assert.match(index, /approver_user_ids: approverIds/);
  assert.match(index, /action: 'recall_internal_approval'/);
  assert.match(index, /current_approver_user_id\) === Number\(currentLoggedInUser\?\.id\)/);
  assert.match(index, /request\.steps/);
});

test('pending executive approvals use deduplicated in-app toasts without browser push', async () => {
  const index = await readIndex();
  assert.match(index, /id="approval-toast-container"/);
  assert.match(index, /cnhy_approval_toast_/);
  assert.match(index, /pending_approval_notifications/);
  assert.match(index, /notification\.approval_request_id/);
  assert.match(index, /approvalRequestsDb = Array\.isArray\(payload\.approval_requests\)/);
  assert.match(index, /결재 화면으로 이동/);
  assert.doesNotMatch(index, /Notification\.requestPermission|new Notification\(/);
});

test('mobile results can hide the header and put the grade first', async () => {
  const index = await readIndex();
  assert.match(index, /id="mobile-header-toggle"/);
  assert.match(index, /cnhy_mobile_header_hidden/);
  assert.match(index, /html\.mobile-header-hidden header/);
  assert.match(index, /#view-myresults #my-grade-card \{[\s\S]*order: -1/);
  assert.match(index, /<details[\s\S]*상세 안내/);
  assert.doesNotMatch(index, /confetti|fireworks?|폭죽/i);
});
