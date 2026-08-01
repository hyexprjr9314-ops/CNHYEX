import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canSendGradeNotice, mailIdempotencyKey, passwordResetIdempotencyBucket, summarizeDispatch } from '../lib/mail-delivery.js';
import { buildGradeNoticeEmail } from '../api/mail.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

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

test('sent grade notices are returned to administrators and rendered as complete', async () => {
  const [adminState, html, mail] = await Promise.all([
    read('../api/admin-state.js'),
    read('../index.html'),
    read('../api/mail.js')
  ]);
  assert.match(adminState, /evaluation_mail_dispatch_audit[\s\S]*?eq\('mail_kind', 'grade_notice'\)[\s\S]*?eq\('dispatch_status', 'sent'\)/);
  assert.match(adminState, /grade_mail_dispatches: gradeMailDispatches\.data \|\| \[\]/);
  assert.match(html, /sentGradeMailKeys\.has/);
  assert.match(html, /fa-check[\s\S]*?발송 완료/);
  assert.match(mail, /buildGradeNoticeEmail/);
  assert.doesNotMatch(mail, /\[HR evaluation\]|final grade notice|your final grade/);
});

test('grade notice email mirrors the web badge and includes confidentiality guidance', () => {
  const message = buildGradeNoticeEmail({ name: '홍길동', cycleName: '2026년 상반기', grade: 'S' });
  assert.equal(message.subject, '[충남한양 인사평가] 2026년 상반기 최종 평가등급 안내');
  assert.match(message.html, /💎[\s\S]*S Grade/);
  assert.match(message.html, /다른 사람과 평가 결과를 공유하는 행위 발생 시 인사상 불이익이 있을 수 있습니다/);
  assert.match(message.text, /\[보안 안내\]/);
});
