import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isValidLoginName, normalizeLoginName, pinAuthPassword } from '../lib/pin-auth.js';

const GENERIC_ERROR = '이름 또는 PIN을 다시 확인해 주세요.';
const send = (res, status, payload) => res.status(status).json(payload);
const hash = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !publicKey) return send(res, 500, { error: '간편 로그인 서비스가 설정되지 않았습니다.' });

  const name = normalizeLoginName(req.body?.name);
  const company = String(req.body?.company || '').trim();
  const phoneSuffix = String(req.body?.phone_suffix || '').replace(/\D/g, '');
  const pin = String(req.body?.pin || '');
  if (!isValidLoginName(name) || !/^\d{6}$/.test(pin) || company.length > 50 || (phoneSuffix && !/^\d{4}$/.test(phoneSuffix))) {
    return send(res, 401, { error: GENERIC_ERROR });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const loginHash = hash(serviceKey, name);
  const ipHash = hash(serviceKey, ip || 'unknown');
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const recent = await service.from('pin_login_attempt_audit')
      .select('login_id_hash,ip_hash,status').gte('attempted_at', since)
      .or(`login_id_hash.eq.${loginHash},ip_hash.eq.${ipHash}`);
    if (recent.error) throw recent.error;
    const attempts = recent.data || [];
    const throttled = attempts.filter(row => row.login_id_hash === loginHash && row.status === 'failed').length >= 5
      || attempts.filter(row => row.ip_hash === ipHash && row.status === 'failed').length >= 20;
    if (throttled) {
      const audit = await service.from('pin_login_attempt_audit').insert({ login_id_hash: loginHash, ip_hash: ipHash, status: 'throttled' });
      if (audit.error) throw audit.error;
      return send(res, 429, { error: '잠시 후 다시 시도해 주세요.' });
    }

    let query = service.from('users')
      .select('id,auth_email,login_id,company,phone,active,login_method,pin_enrolled')
      .eq('pin_login_name', name).eq('active', true).eq('login_method', 'pin').eq('pin_enrolled', true).limit(10);
    if (company) query = query.eq('company', company);
    const profiles = await query;
    if (profiles.error) throw profiles.error;
    const candidates = profiles.data || [];
    const authenticated = [];
    const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const profile of candidates) {
      if (!profile.auth_email || !profile.login_id) continue;
      const signedIn = await client.auth.signInWithPassword({
        email: profile.auth_email,
        password: pinAuthPassword(pin, profile.login_id, serviceKey)
      });
      if (!signedIn.error) authenticated.push({ profile, session: signedIn.data.session });
    }

    const companies = [...new Set(authenticated.map(({ profile }) => profile.company).filter(Boolean))];
    if (!company && companies.length > 1) {
      return send(res, 409, { requires_company: true, companies });
    }
    let matches = authenticated;
    if (phoneSuffix) matches = matches.filter(({ profile }) => String(profile.phone || '').replace(/\D/g, '').endsWith(phoneSuffix));
    if (matches.length > 1 && !phoneSuffix) return send(res, 409, { requires_phone_suffix: true });
    if (matches.length > 1) return send(res, 409, { error: '동명이인 계정을 구분할 수 없습니다. 관리자에게 문의해 주세요.' });

    const session = matches[0]?.session || null;
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
