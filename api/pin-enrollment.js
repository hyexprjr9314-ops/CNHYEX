import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { activationCodeHash, isAllowedPin, isValidLoginName, normalizeLoginName, pinAuthPassword } from '../lib/pin-auth.js';

const GENERIC_ERROR = '이름 또는 임시번호를 다시 확인해 주세요.';
const send = (res, status, payload) => res.status(status).json(payload);
const auditHash = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res, 500, { error: 'PIN 등록 서비스가 설정되지 않았습니다.' });

  const name = normalizeLoginName(req.body?.name);
  const code = String(req.body?.temporary_code || '').replace(/\s/g, '');
  const pin = String(req.body?.pin || '');
  if (!isValidLoginName(name) || !/^\d{8}$/.test(code) || !isAllowedPin(pin, name)) {
    return send(res, 400, { error: GENERIC_ERROR });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const loginHash = auditHash(key, `activation:${name}`);
  const ipHash = auditHash(key, ip || 'unknown');
  const codeHash = activationCodeHash(code, key);
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const recent = await service.from('pin_login_attempt_audit')
      .select('login_id_hash,ip_hash,status').gte('attempted_at', since)
      .or(`login_id_hash.eq.${loginHash},ip_hash.eq.${ipHash}`);
    if (recent.error) throw recent.error;
    const attempts = recent.data || [];
    const throttled = attempts.filter(row => row.login_id_hash === loginHash && row.status === 'activation_failed').length >= 5
      || attempts.filter(row => row.ip_hash === ipHash && row.status === 'activation_failed').length >= 20;
    if (throttled) return send(res, 429, { error: '임시번호 입력 횟수를 초과했습니다. 관리자에게 새 번호를 요청해 주세요.' });

    const found = await service.from('users')
      .select('id,name,company,login_id,auth_user_id,pin_enrollment_expires_at,active,login_method')
      .eq('pin_login_name', name).eq('pin_enrollment_token_hash', codeHash).maybeSingle();
    if (found.error) throw found.error;
    const user = found.data;
    const eligible = user?.active === true && user.login_method === 'pin' && Boolean(user.auth_user_id)
      && new Date(user.pin_enrollment_expires_at).getTime() > Date.now();
    if (!eligible) {
      const audit = await service.from('pin_login_attempt_audit').insert({ login_id_hash: loginHash, ip_hash: ipHash, status: 'activation_failed' });
      if (audit.error) throw audit.error;
      return send(res, 410, { error: GENERIC_ERROR });
    }

    const claimed = await service.from('users').update({
      pin_enrollment_token_hash: null,
      pin_enrollment_expires_at: null
    }).eq('id', user.id).eq('pin_enrollment_token_hash', codeHash).select('id').maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) return send(res, 410, { error: '임시번호가 이미 사용되었습니다.' });

    const updatedAuth = await service.auth.admin.updateUserById(user.auth_user_id, {
      password: pinAuthPassword(pin, user.login_id, key)
    });
    if (updatedAuth.error) {
      await service.from('users').update({
        pin_enrollment_token_hash: codeHash,
        pin_enrollment_expires_at: user.pin_enrollment_expires_at
      }).eq('id', user.id).eq('pin_enrolled', false);
      throw updatedAuth.error;
    }

    const updatedProfile = await service.from('users').update({
      pin_enrolled: true,
      updated_at: new Date().toISOString()
    }).eq('id', user.id).eq('pin_enrolled', false);
    if (updatedProfile.error) {
      await service.auth.admin.updateUserById(user.auth_user_id, { password: `${crypto.randomBytes(24).toString('base64url')}Aa1!` });
      await service.from('users').update({
        pin_enrollment_token_hash: codeHash,
        pin_enrollment_expires_at: user.pin_enrollment_expires_at
      }).eq('id', user.id).eq('pin_enrolled', false);
      throw updatedProfile.error;
    }
    const audit = await service.from('pin_login_attempt_audit').insert({ login_id_hash: loginHash, ip_hash: ipHash, status: 'activation_success' });
    if (audit.error) console.error('PIN activation audit failed:', audit.error);
    return send(res, 200, { enrolled: true, name: user.name, company: user.company });
  } catch (error) {
    console.error('PIN enrollment failed:', error);
    return send(res, 500, { error: 'PIN을 등록하지 못했습니다. 관리자에게 새 임시번호를 요청해 주세요.' });
  }
}
