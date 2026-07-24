import test from 'node:test';
import assert from 'node:assert/strict';
import { canSendGradeNotice, mailIdempotencyKey, passwordResetIdempotencyBucket, summarizeDispatch } from './mail-delivery.js';

test('mail idempotency and grade eligibility are deterministic and gated', () => {
  assert.equal(mailIdempotencyKey({ kind: 'grade_notice', cycleId: 3, targetId: 7 }), mailIdempotencyKey({ kind: 'grade_notice', cycleId: 3, targetId: 7 }));
  assert.notEqual(mailIdempotencyKey({ kind: 'grade_notice', cycleId: 3, targetId: 7 }), mailIdempotencyKey({ kind: 'grade_notice', cycleId: 3, targetId: 7, retry: 1 }));
  assert.equal(canSendGradeNotice({ results_published: true, result_gate_open: true, internal_approval_status: 'approved' }, { grade: 'A' }), true);
  assert.equal(canSendGradeNotice({ results_published: true, result_gate_open: false, internal_approval_status: 'approved' }, { grade: 'A' }), false);
  assert.deepEqual(summarizeDispatch([{ status: 'sent' }, { status: 'duplicate' }, { status: 'sent' }]), { sent: 2, duplicate: 1, failed: 0, skipped: 0 });
});

test('password reset idempotency is bounded by an hourly resend window', () => {
  assert.equal(passwordResetIdempotencyBucket('2026-07-24T10:00:01Z'), '2026-07-24T10');
  assert.equal(passwordResetIdempotencyBucket('2026-07-24T10:59:59Z'), '2026-07-24T10');
  assert.notEqual(passwordResetIdempotencyBucket('2026-07-24T10:59:59Z'), passwordResetIdempotencyBucket('2026-07-24T11:00:00Z'));
  assert.notEqual(
    mailIdempotencyKey({ kind: 'password_reset', targetId: 7, bucket: '2026-07-24T10' }),
    mailIdempotencyKey({ kind: 'password_reset', targetId: 7, bucket: '2026-07-24T11' })
  );
});
