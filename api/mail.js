import { createClient } from '@supabase/supabase-js';
import { ROLES } from './role-policy.js';
import {
  canSendGradeNotice,
  canonicalPasswordResetRedirect,
  mailIdempotencyKey,
  passwordResetIdempotencyBucket,
  summarizeDispatch
} from './mail-delivery.js';

const send = (res, status, payload) => res.status(status).json(payload);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authorize(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Login is required.'), { status: 401 });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('Invalid login session.'), { status: 401 });
  const profile = await service.from('users').select('id,sys_role,active').eq('auth_user_id', auth.data.user.id).maybeSingle();
  if (profile.error || !profile.data || profile.data.active !== true || profile.data.sys_role !== ROLES.admin) {
    throw Object.assign(new Error('Administrator role required.'), { status: 403 });
  }
  return { authUser: auth.data.user, profile: profile.data };
}

async function claimDispatch(service, record, retry) {
  const claim = await service.rpc('claim_evaluation_mail_dispatch', {
    p_cycle_id: record.cycleId,
    p_target_id: record.targetId,
    p_recipient_email: record.email,
    p_mail_kind: record.kind,
    p_idempotency_key: mailIdempotencyKey(record),
    p_result_version: Number.isInteger(Number(record.resultVersion)) ? Number(record.resultVersion) : null,
    p_requested_by: record.actorId,
    p_retry: retry
  });
  if (claim.error) throw claim.error;
  const row = claim.data?.[0];
  if (!row?.claimed) return { duplicate: row || null };
  return { audit: { id: row.id } };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

async function updateAudit(service, id, status, errorMessage = null) {
  const result = await service.from('evaluation_mail_dispatch_audit').update({
    dispatch_status: status,
    dispatched_at: status === 'sent' ? new Date().toISOString() : null,
    error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null
  }).eq('id', id);
  if (result.error) throw result.error;
}

async function sendGradeViaSmtp({ to, name, cycleName, grade }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from) throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM are required.');
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host, port, secure: process.env.SMTP_SECURE === 'true', auth: { user, pass }
  });
  await transport.sendMail({
    from, to,
    subject: `[HR evaluation] ${cycleName} final grade notice`,
    text: `${name}, your final grade for ${cycleName} is ${grade}. Log in to the HR evaluation system for the published result.`
  });
}

async function dispatchPassword(service, actor, target, retry) {
  // The hourly bucket prevents duplicate clicks, but supports resend after a
  // reset link expires without changing the grade-notice idempotency policy.
  const record = {
    kind: 'password_reset', cycleId: null, targetId: target.id, email: target.email,
    actorId: actor.authUser.id, bucket: passwordResetIdempotencyBucket()
  };
  const audit = await claimDispatch(service, record, retry);
  if (audit.duplicate) return { target_id: target.id, status: 'duplicate' };
  try {
    const reset = await service.auth.resetPasswordForEmail(target.email, {
      redirectTo: canonicalPasswordResetRedirect(process.env.PASSWORD_RESET_REDIRECT_URL)
    });
    if (reset.error) throw reset.error;
    await updateAudit(service, audit.audit.id, 'sent');
    return { target_id: target.id, status: 'sent' };
  } catch (error) {
    await updateAudit(service, audit.audit.id, 'failed', error.message);
    return { target_id: target.id, status: 'failed', message: error.message };
  }
}

async function dispatchGrade(service, actor, cycle, finalResult, target, retry) {
  const record = {
    kind: 'grade_notice', cycleId: cycle.id, targetId: target.id, email: target.email,
    actorId: actor.authUser.id, resultVersion: finalResult.result_version
  };
  const audit = await claimDispatch(service, record, retry);
  if (audit.duplicate) return { target_id: target.id, status: 'duplicate' };
  try {
    await sendGradeViaSmtp({ to: target.email, name: target.name, cycleName: cycle.name, grade: finalResult.relative_grade });
    await updateAudit(service, audit.audit.id, 'sent');
    return { target_id: target.id, status: 'sent' };
  } catch (error) {
    await updateAudit(service, audit.audit.id, 'failed', error.message);
    return { target_id: target.id, status: 'failed', message: error.message };
  }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res, 500, { error: 'Supabase server environment is not configured.' });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Only POST is supported.' });
    const actor = await authorize(req, service);
    const action = String(req.body?.action || '');
    const retry = req.body?.retry === true;
    const requestedIds = [...new Set((Array.isArray(req.body?.target_ids) ? req.body.target_ids : [req.body?.target_id]).map(Number).filter(Boolean))];
    if (!['password_reset', 'password_reset_bulk', 'grade_notice', 'grade_notice_bulk'].includes(action)) return send(res, 400, { error: 'Unsupported mail action.' });
    if (!action.endsWith('_bulk') && requestedIds.length !== 1) return send(res, 400, { error: 'Exactly one target is required.' });

    if (action.startsWith('password_reset')) {
      let query = service.from('users').select('id,name,email,auth_user_id,active').eq('active', true).not('auth_user_id', 'is', null);
      if (requestedIds.length) query = query.in('id', requestedIds);
      const targets = await query;
      if (targets.error) throw targets.error;
      const eligible = (targets.data || []).filter(target => emailPattern.test(target.email || ''));
      const results = await mapConcurrent(eligible, 5, target => dispatchPassword(service, actor, target, retry));
      return send(res, 200, { results, summary: summarizeDispatch(results) });
    }

    const cycleId = Number(req.body?.cycle_id);
    if (!cycleId) return send(res, 400, { error: 'Evaluation cycle ID is required.' });
    const cycleResult = await service.from('evaluation_cycles')
      .select('id,name,result_version,results_published,result_gate_open,internal_approval_status')
      .eq('id', cycleId).single();
    if (cycleResult.error) throw cycleResult.error;
    const finalResultQuery = await service.from('evaluation_final_results')
      .select('target_id,result_version,relative_grade')
      .eq('cycle_id', cycleId)
      .eq('result_version', cycleResult.data.result_version);
    if (finalResultQuery.error) throw finalResultQuery.error;
    const finalByTarget = new Map((finalResultQuery.data || [])
      .filter(row => row.relative_grade)
      .map(row => [Number(row.target_id), row]));
    if (!finalByTarget.size || !canSendGradeNotice(cycleResult.data, { grade: 'available' })) {
      return send(res, 409, { error: 'Approved, published current final results are required before sending grade notices.' });
    }

    let targetQuery = service.from('users').select('id,name,email,active').eq('active', true);
    if (requestedIds.length) targetQuery = targetQuery.in('id', requestedIds);
    const targets = await targetQuery;
    if (targets.error) throw targets.error;
    const results = await mapConcurrent(targets.data || [], 5, target => {
      const finalResult = finalByTarget.get(Number(target.id));
      if (!finalResult || !emailPattern.test(target.email || '')) return { target_id: target.id, status: 'skipped' };
      return dispatchGrade(service, actor, cycleResult.data, finalResult, target, retry);
    });
    return send(res, 200, { results, summary: summarizeDispatch(results) });
  } catch (error) {
    return send(res, error.status || 500, { error: error.message || 'Unable to send mail.' });
  }
}
