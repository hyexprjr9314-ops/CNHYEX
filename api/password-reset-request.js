import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { canonicalPasswordResetRedirect } from './mail-delivery.js';

const GENERIC_MESSAGE = '등록된 활성 계정이면 비밀번호 설정 메일을 발송했습니다. 메일함과 스팸함을 확인해 주세요.';
const send = (res, status, payload) => res.status(status).json(payload);

export function normalizeResetEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function requestFingerprint(req, email, secret) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const hash = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  return { emailHash: hash(email), ipHash: hash(ip || 'unknown') };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res, 500, { error: 'Password reset service is not configured.' });

  const email = normalizeResetEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 200, { message: GENERIC_MESSAGE });

  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { emailHash, ipHash } = requestFingerprint(req, email, key);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    const recent = await service.from('password_reset_request_audit')
      .select('email_hash,ip_hash').gte('requested_at', since).or(`email_hash.eq.${emailHash},ip_hash.eq.${ipHash}`);
    if (recent.error) throw recent.error;
    const rows = recent.data || [];
    const throttled = rows.filter(row => row.email_hash === emailHash).length >= 3
      || rows.filter(row => row.ip_hash === ipHash).length >= 10;
    if (throttled) return send(res, 200, { message: GENERIC_MESSAGE });

    const profile = await service.from('users')
      .select('id,email,auth_user_id,active,login_method').eq('email', email).eq('login_method', 'email').maybeSingle();
    const eligible = !profile.error && profile.data?.active === true && Boolean(profile.data.auth_user_id);
    let status = 'ignored';
    let errorMessage = null;
    if (eligible) {
      const reset = await service.auth.resetPasswordForEmail(email, {
        redirectTo: canonicalPasswordResetRedirect(process.env.PASSWORD_RESET_REDIRECT_URL)
      });
      status = reset.error ? 'failed' : 'sent';
      errorMessage = reset.error ? String(reset.error.message || reset.error).slice(0, 1000) : null;
    }
    const audit = await service.from('password_reset_request_audit').insert({
      target_id: profile.data?.id || null,
      email_hash: emailHash,
      ip_hash: ipHash,
      status,
      error_message: errorMessage
    });
    if (audit.error) throw audit.error;
    return send(res, 200, { message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('Public password reset request failed:', error);
    return send(res, 200, { message: GENERIC_MESSAGE });
  }
}
