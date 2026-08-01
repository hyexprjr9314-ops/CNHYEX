import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isAllowedPin, pinAuthPassword } from './pin-login.js';

const send = (res, status, payload) => res.status(status).json(payload);
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

async function findEnrollment(service, token) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const result = await service.from('users')
    .select('id,name,company,login_id,auth_user_id,pin_enrollment_expires_at,active,login_method')
    .eq('pin_enrollment_token_hash', tokenHash(token)).maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row || row.active !== true || row.login_method !== 'pin' || !row.auth_user_id
      || new Date(row.pin_enrollment_expires_at).getTime() <= Date.now()) return null;
  return row;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res, 500, { error: 'PIN 등록 서비스가 설정되지 않았습니다.' });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = String(req.method === 'GET' ? req.query?.token : req.body?.token || '');
  try {
    const user = await findEnrollment(service, token);
    if (!user) return send(res, 410, { error: '등록 링크가 만료되었거나 이미 사용되었습니다.' });
    if (req.method === 'GET') return send(res, 200, {
      name: user.name, company: user.company, login_id: user.login_id,
      expires_at: user.pin_enrollment_expires_at
    });

    const pin = String(req.body?.pin || '');
    if (!isAllowedPin(pin, user.login_id)) {
      return send(res, 400, { error: '연속 숫자·반복 숫자·사번과 같은 PIN은 사용할 수 없습니다.' });
    }
    const claimed = await service.from('users').update({
      pin_enrollment_token_hash: null,
      pin_enrollment_expires_at: null
    }).eq('id', user.id).eq('pin_enrollment_token_hash', tokenHash(token)).select('id').maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) return send(res, 410, { error: '등록 링크가 이미 사용되었습니다.' });
    const updatedAuth = await service.auth.admin.updateUserById(user.auth_user_id, {
      password: pinAuthPassword(pin, user.login_id, key)
    });
    if (updatedAuth.error) {
      await service.from('users').update({
        pin_enrollment_token_hash: tokenHash(token),
        pin_enrollment_expires_at: user.pin_enrollment_expires_at
      }).eq('id', user.id).eq('pin_enrolled', false);
      throw updatedAuth.error;
    }
    const updatedProfile = await service.from('users').update({
      pin_enrolled: true,
      updated_at: new Date().toISOString()
    }).eq('id', user.id).eq('pin_enrolled', false);
    if (updatedProfile.error) {
      await service.auth.admin.updateUserById(user.auth_user_id, {
        password: `${crypto.randomBytes(24).toString('base64url')}Aa1!`
      });
      await service.from('users').update({
        pin_enrollment_token_hash: tokenHash(token),
        pin_enrollment_expires_at: user.pin_enrollment_expires_at
      }).eq('id', user.id).eq('pin_enrolled', false);
      throw updatedProfile.error;
    }
    return send(res, 200, { enrolled: true, login_id: user.login_id });
  } catch (error) {
    console.error('PIN enrollment failed:', error);
    return send(res, 500, { error: 'PIN을 등록하지 못했습니다. 관리자에게 새 링크를 요청해 주세요.' });
  }
}
