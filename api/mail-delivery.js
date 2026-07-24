import crypto from 'node:crypto';

export function mailIdempotencyKey({ kind, cycleId = null, targetId, resultVersion = 'v1', bucket = 'default', retry = 0 }) {
  const source = `${kind}:${cycleId || 0}:${targetId}:${resultVersion}:${bucket}:${retry}`;
  return crypto.createHash('sha256').update(source).digest('hex');
}

// Password reset links expire.  A bounded hourly key prevents accidental
// double-click sends while allowing a new administrator-requested link after
// the previous one is likely unusable. Grade notices remain version-bound.
export function passwordResetIdempotencyBucket(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid password reset request time.');
  return date.toISOString().slice(0, 13);
}

export function canonicalPasswordResetRedirect(value, environment = process.env.VERCEL_ENV) {
  if (!value) throw new Error('PASSWORD_RESET_REDIRECT_URL must be configured.');
  const url = new URL(value);
  const isLocalDevelopment = environment === 'development' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalDevelopment) {
    throw new Error('PASSWORD_RESET_REDIRECT_URL must use HTTPS outside local development.');
  }
  return url.toString();
}

export function canSendGradeNotice(cycle, archiveRow) {
  return Boolean(
    cycle?.results_published === true
      && cycle?.result_gate_open === true
      && cycle?.internal_approval_status === 'approved'
      && archiveRow?.grade
  );
}

export function summarizeDispatch(results) {
  const summary = { sent: 0, duplicate: 0, failed: 0, skipped: 0 };
  for (const row of results) {
    summary[row.status] = (summary[row.status] || 0) + 1;
  }
  return summary;
}
