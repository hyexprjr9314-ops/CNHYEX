import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const GENERIC_ERROR = '사번 또는 PIN을 다시 확인해 주세요.';
const send = (res, status, payload) => res.status(status).json(payload);
const hash = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

export function normalizeLoginId(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

export function isAllowedPin(pin, loginId = '') {
  if (!/^\d{6}$/.test(pin)) return false;
  if (/^(\d)\1{5}$/.test(pin)) return false;
  if (['012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321'].includes(pin)) return false;
  return !String(loginId).replace(/\D/g, '').endsWith(pin);
}

export function pinAuthPassword(pin, loginId, secret) {
  return `${crypto.createHmac('sha256', secret).update(`${normalizeLoginId(loginId)}:${pin}`).digest('base64url')}Aa1!`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !publicKey) return send(res, 500, { error: '간편 로그인 서비스가 설정되지 않았습니다.' });

  const loginId = normalizeLoginId(req.body?.login_id);
  const pin = String(req.body?.pin || '');
  if (!/^[A-Z0-9-]{3,30}$/.test(loginId) || !/^\d{6}$/.test(pin)) return send(res, 401, { error: GENERIC_ERROR });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const loginHash = hash(serviceKey, loginId);
  const ipHash = hash(serviceKey, ip || 'unknown');
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const recent = await service.from('pin_login_attempt_audit')
      .select('login_id_hash,ip_hash,status').gte('attempted_at', since)
      .or(`login_id_hash.eq.${loginHash},ip_hash.eq.${ipHash}`);
    if (recent.error) throw recent.error;
    const attempts = recent.data || [];
    const throttled = attempts.filter(row => row.login_id_hash === loginHash && row.status !== 'success').length >= 5
      || attempts.filter(row => row.ip_hash === ipHash && row.status !== 'success').length >= 20;
    if (throttled) {
      const audit = await service.from('pin_login_attempt_audit').insert({ login_id_hash: loginHash, ip_hash: ipHash, status: 'throttled' });
      if (audit.error) throw audit.error;
      return send(res, 429, { error: '잠시 후 다시 시도해 주세요.' });
    }

    const profile = await service.from('users')
      .select('id,auth_email,active,login_method,pin_enrolled')
      .ilike('login_id', loginId).maybeSingle();
    if (profile.error) throw profile.error;
    const eligible = profile.data?.active === true && profile.data.login_method === 'pin'
      && profile.data.pin_enrolled === true && Boolean(profile.data.auth_email);
    let session = null;
    if (eligible) {
      const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await client.auth.signInWithPassword({
        email: profile.data.auth_email,
        password: pinAuthPassword(pin, loginId, serviceKey)
      });
      if (!signedIn.error) session = signedIn.data.session;
    }
    const audit = await service.from('pin_login_attempt_audit').insert({
      login_id_hash: loginHash, ip_hash: ipHash, status: session ? 'success' : 'failed'
    });
    if (audit.error) throw audit.error;
    if (!session) return send(res, 401, { error: GENERIC_ERROR });
    return send(res, 200, { access_token: session.access_token, refresh_token: session.refresh_token });
  } catch (error) {
    console.error('PIN login failed:', error);
    return send(res, 503, { error: '간편 로그인 연결을 확인해 주세요.' });
  }
}
